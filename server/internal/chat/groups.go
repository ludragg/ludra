package chat

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"ludra/internal/database"
	"ludra/internal/ids"
	"ludra/internal/imaging"
)

var groupNamePattern = regexp.MustCompile(`^[\p{L}\p{M}\p{N} _.,!?'&()#+:-]+$`)

const (
	maxGroupMembers = 10
	maxGroupName    = 50
)

type Group struct {
	ID             string
	Name           string
	OwnerID        string
	Avatar         string
	Members        []database.User
	LastMessage    *database.Message
	LastSenderName string
	LastTargetName *string
}

func (g Group) MemberIDs() []string {
	result := make([]string, len(g.Members))
	for i, member := range g.Members {
		result[i] = member.ID
	}
	return result
}

func (s *Service) ListGroups(ctx context.Context, userID string) ([]Group, error) {
	rows, err := s.queries.ListGroups(ctx, userID)
	if err != nil {
		return nil, err
	}

	groups := make([]Group, len(rows))
	groupIDs := make([]string, len(rows))
	for i, row := range rows {
		groups[i] = Group{ID: row.ID, Name: deref(row.Name), OwnerID: deref(row.OwnerID), Avatar: row.Avatar}
		groupIDs[i] = row.ID
		if row.LastMessageID != nil {
			groups[i].LastMessage = &database.Message{
				ID:             *row.LastMessageID,
				ConversationID: row.ID,
				SenderID:       *row.LastMessageSenderID,
				Content:        *row.LastMessageContent,
				CreatedAt:      *row.LastMessageCreatedAt,
				Kind:           *row.LastMessageKind,
				CallOutcome:    row.LastMessageCallOutcome,
				CallDuration:   row.LastMessageCallDuration,
				Event:          row.LastMessageEvent,
				TargetID:       row.LastMessageTargetID,
			}
			groups[i].LastSenderName = deref(row.LastMessageSenderName)
			groups[i].LastTargetName = row.LastMessageTargetName
		}
	}

	members, err := s.members(ctx, groupIDs)
	if err != nil {
		return nil, err
	}
	for i := range groups {
		groups[i].Members = members[groups[i].ID]
	}
	return groups, nil
}

func (s *Service) Group(ctx context.Context, userID, groupID string) (Group, error) {
	if !ids.Valid(groupID) {
		return Group{}, ErrGroupNotFound
	}

	conversation, err := s.queries.GetConversation(ctx, groupID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && conversation.Kind != "group") {
		return Group{}, ErrGroupNotFound
	}
	if err != nil {
		return Group{}, err
	}

	members, err := s.members(ctx, []string{groupID})
	if err != nil {
		return Group{}, err
	}
	group := Group{
		ID:      groupID,
		Name:    deref(conversation.Name),
		OwnerID: deref(conversation.OwnerID),
		Avatar:  conversation.Avatar,
		Members: members[groupID],
	}
	if !contains(group.MemberIDs(), userID) {
		return Group{}, ErrGroupNotFound
	}
	return group, nil
}

func (s *Service) CreateGroup(ctx context.Context, ownerID, name string, memberIDs []string) (Group, error) {
	name = strings.TrimFunc(name, invisible)
	if name == "" || utf8.RuneCountInString(name) > maxGroupName || !groupNamePattern.MatchString(name) {
		return Group{}, ErrInvalidGroupName
	}

	invited := unique(memberIDs, ownerID)
	if len(invited) == 0 {
		return Group{}, ErrNoMembers
	}
	if len(invited)+1 > maxGroupMembers {
		return Group{}, ErrGroupFull
	}
	if err := s.requireFriends(ctx, ownerID, invited); err != nil {
		return Group{}, err
	}

	var groupID string
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)

		var err error
		groupID, err = q.CreateGroup(ctx, database.CreateGroupParams{Name: &name, OwnerID: &ownerID})
		if err != nil {
			return err
		}
		for _, member := range append([]string{ownerID}, invited...) {
			if err := q.AddParticipant(ctx, database.AddParticipantParams{ConversationID: groupID, UserID: member}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return Group{}, err
	}
	return s.Group(ctx, ownerID, groupID)
}

func (s *Service) AddMembers(ctx context.Context, actorID, groupID string, userIDs []string) (Group, []database.Message, error) {
	group, err := s.Group(ctx, actorID, groupID)
	if err != nil {
		return Group{}, nil, err
	}

	current := group.MemberIDs()
	var invited []string
	for _, id := range unique(userIDs, actorID) {
		if !contains(current, id) {
			invited = append(invited, id)
		}
	}
	if len(invited) == 0 {
		return Group{}, nil, ErrNoMembers
	}
	if len(current)+len(invited) > maxGroupMembers {
		return Group{}, nil, ErrGroupFull
	}
	if err := s.requireFriends(ctx, actorID, invited); err != nil {
		return Group{}, nil, err
	}

	var events []database.Message
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		if _, err := q.LockConversation(ctx, groupID); err != nil {
			return err
		}
		member, err := q.IsParticipant(ctx, database.IsParticipantParams{ConversationID: groupID, UserID: actorID})
		if err != nil {
			return err
		}
		if !member {
			return ErrGroupNotFound
		}
		count, err := q.CountParticipants(ctx, groupID)
		if err != nil {
			return err
		}
		if int(count)+len(invited) > maxGroupMembers {
			return ErrGroupFull
		}
		for _, id := range invited {
			if err := q.AddParticipant(ctx, database.AddParticipantParams{ConversationID: groupID, UserID: id}); err != nil {
				return err
			}
			event, err := q.CreateEventMessage(ctx, eventParams(groupID, actorID, "member_added", id))
			if err != nil {
				return err
			}
			events = append(events, event)
		}
		return nil
	})
	if err != nil {
		return Group{}, nil, err
	}

	group, err = s.Group(ctx, actorID, groupID)
	return group, events, err
}

func (s *Service) RemoveMember(ctx context.Context, actorID, groupID, userID string) (Group, database.Message, error) {
	group, err := s.Group(ctx, actorID, groupID)
	if err != nil {
		return Group{}, database.Message{}, err
	}
	if group.OwnerID != actorID {
		return Group{}, database.Message{}, ErrNotGroupOwner
	}
	if userID == actorID || !contains(group.MemberIDs(), userID) {
		return Group{}, database.Message{}, ErrMemberNotFound
	}

	var event database.Message
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		owner, err := q.LockConversation(ctx, groupID)
		if err != nil {
			return err
		}
		if owner == nil || *owner != actorID {
			return ErrNotGroupOwner
		}
		removed, err := q.RemoveParticipant(ctx, database.RemoveParticipantParams{ConversationID: groupID, UserID: userID})
		if err != nil {
			return err
		}
		if removed == 0 {
			return ErrMemberNotFound
		}
		event, err = q.CreateEventMessage(ctx, eventParams(groupID, actorID, "member_removed", userID))
		return err
	})
	if err != nil {
		return Group{}, database.Message{}, err
	}

	group, err = s.Group(ctx, actorID, groupID)
	return group, event, err
}

func (s *Service) TransferOwner(ctx context.Context, actorID, groupID, userID string) (Group, database.Message, error) {
	group, err := s.Group(ctx, actorID, groupID)
	if err != nil {
		return Group{}, database.Message{}, err
	}
	if userID == actorID || !contains(group.MemberIDs(), userID) {
		return Group{}, database.Message{}, ErrMemberNotFound
	}

	var event database.Message
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		owner, err := q.LockConversation(ctx, groupID)
		if err != nil {
			return err
		}
		if owner == nil || *owner != actorID {
			return ErrNotGroupOwner
		}
		member, err := q.IsParticipant(ctx, database.IsParticipantParams{ConversationID: groupID, UserID: userID})
		if err != nil {
			return err
		}
		if !member {
			return ErrMemberNotFound
		}
		if err := q.SetOwner(ctx, database.SetOwnerParams{ID: groupID, OwnerID: &userID}); err != nil {
			return err
		}
		event, err = q.CreateEventMessage(ctx, eventParams(groupID, actorID, "owner_changed", userID))
		return err
	})
	if err != nil {
		return Group{}, database.Message{}, err
	}

	group, err = s.Group(ctx, actorID, groupID)
	return group, event, err
}

func (s *Service) SetGroupAvatar(ctx context.Context, actorID, groupID string, image []byte) (Group, error) {
	if image != nil && !imaging.ValidAvatar(image) {
		return Group{}, ErrInvalidGroupAvatar
	}
	group, err := s.Group(ctx, actorID, groupID)
	if err != nil {
		return Group{}, err
	}
	if group.OwnerID != actorID {
		return Group{}, ErrNotGroupOwner
	}

	avatar := ""
	if image != nil {
		if avatar, err = imaging.Version(); err != nil {
			return Group{}, err
		}
	}
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		owner, err := q.LockConversation(ctx, groupID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrGroupNotFound
		}
		if err != nil {
			return err
		}
		if owner == nil || *owner != actorID {
			return ErrNotGroupOwner
		}
		if image == nil {
			if err := q.DeleteGroupAvatar(ctx, groupID); err != nil {
				return err
			}
		} else if err := q.SaveGroupAvatar(ctx, database.SaveGroupAvatarParams{ConversationID: groupID, Image: image}); err != nil {
			return err
		}
		return q.SetGroupAvatar(ctx, database.SetGroupAvatarParams{ID: groupID, Avatar: avatar})
	})
	if err != nil {
		return Group{}, err
	}
	group.Avatar = avatar
	return group, nil
}

func (s *Service) GroupAvatar(ctx context.Context, groupID string) ([]byte, error) {
	if !ids.Valid(groupID) {
		return nil, ErrGroupNotFound
	}
	image, err := s.queries.GetGroupAvatar(ctx, groupID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrGroupNotFound
	}
	return image, err
}

func (s *Service) DeleteGroup(ctx context.Context, actorID, groupID string) ([]string, error) {
	group, err := s.Group(ctx, actorID, groupID)
	if err != nil {
		return nil, err
	}

	var memberIDs []string
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		owner, err := q.LockConversation(ctx, group.ID)
		if err != nil {
			return err
		}
		if owner == nil || *owner != actorID {
			return ErrNotGroupOwner
		}
		memberIDs, err = q.ListParticipantIDs(ctx, group.ID)
		if err != nil {
			return err
		}
		return q.DeleteConversation(ctx, group.ID)
	})
	return memberIDs, err
}

func (s *Service) LeaveGroup(ctx context.Context, userID, groupID string) (Group, *database.Message, error) {
	group, err := s.Group(ctx, userID, groupID)
	if err != nil {
		return Group{}, nil, err
	}

	var event *database.Message
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		owner, err := q.LockConversation(ctx, groupID)
		if err != nil {
			return err
		}
		removed, err := q.RemoveParticipant(ctx, database.RemoveParticipantParams{ConversationID: groupID, UserID: userID})
		if err != nil {
			return err
		}
		if removed == 0 {
			return ErrGroupNotFound
		}

		remaining, err := q.CountParticipants(ctx, groupID)
		if err != nil {
			return err
		}
		if remaining == 0 {
			return q.DeleteConversation(ctx, groupID)
		}

		if owner == nil || *owner == userID {
			next, err := q.OldestParticipant(ctx, groupID)
			if err != nil {
				return err
			}
			if err := q.SetOwner(ctx, database.SetOwnerParams{ID: groupID, OwnerID: &next}); err != nil {
				return err
			}
		}

		left, err := q.CreateEventMessage(ctx, eventParams(groupID, userID, "member_left", userID))
		event = &left
		return err
	})
	if err != nil {
		return Group{}, nil, err
	}
	if event == nil {
		return Group{ID: groupID}, nil, nil
	}

	members, err := s.members(ctx, []string{groupID})
	if err != nil {
		return Group{}, nil, err
	}
	conversation, err := s.queries.GetConversation(ctx, groupID)
	if err != nil {
		return Group{}, nil, err
	}
	return Group{
		ID:      groupID,
		Name:    group.Name,
		OwnerID: deref(conversation.OwnerID),
		Avatar:  conversation.Avatar,
		Members: members[groupID],
	}, event, nil
}

func (s *Service) StartGroupCallMessage(ctx context.Context, groupID, starterID string) (database.Message, error) {
	return s.queries.CreateCallMessage(ctx, database.CreateCallMessageParams{ConversationID: groupID, SenderID: starterID})
}

func (s *Service) members(ctx context.Context, groupIDs []string) (map[string][]database.User, error) {
	result := make(map[string][]database.User, len(groupIDs))
	if len(groupIDs) == 0 {
		return result, nil
	}

	rows, err := s.queries.ListGroupMembers(ctx, groupIDs)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.ConversationID] = append(result[row.ConversationID], database.User{ID: row.ID, Username: row.Username, Avatar: row.Avatar})
	}
	return result, nil
}

func (s *Service) requireFriends(ctx context.Context, userID string, others []string) error {
	for _, other := range others {
		if !ids.Valid(other) {
			return ErrNotFriends
		}
		friends, err := s.queries.AreFriends(ctx, database.AreFriendsParams{UserID: userID, FriendID: other})
		if err != nil {
			return err
		}
		if !friends {
			return ErrNotFriends
		}
	}
	return nil
}

func eventParams(groupID, senderID, event, targetID string) database.CreateEventMessageParams {
	return database.CreateEventMessageParams{
		ConversationID: groupID,
		SenderID:       senderID,
		Event:          &event,
		TargetID:       &targetID,
	}
}

func unique(values []string, exclude string) []string {
	seen := map[string]bool{exclude: true}
	var result []string
	for _, value := range values {
		if !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	return result
}

func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
