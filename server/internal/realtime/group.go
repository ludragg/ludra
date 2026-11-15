package realtime

import (
	"context"
	"log/slog"

	"ludra/internal/chat"
	"ludra/internal/protocol"
)

func (s *session) groupConversation(group chat.Group) *protocol.Conversation {
	return toGroupConversation(group, s.rooms.state(group.ID))
}

func (s *session) createGroup(ctx context.Context, req *protocol.CreateGroup) *protocol.ServerFrame {
	if !s.guard.groupChanges.Allow(s.user.Id) {
		return tooManyRequests()
	}

	group, err := s.chat.CreateGroup(ctx, s.user.Id, req.Name, req.MemberIds)
	if err != nil {
		return failed(err)
	}

	reply := conversationUpdatedFrame(s.groupConversation(group))
	s.hub.publish(group.MemberIDs(), reply, s)
	return reply
}

func (s *session) addGroupMembers(ctx context.Context, req *protocol.AddGroupMembers) *protocol.ServerFrame {
	if !s.guard.groupChanges.Allow(s.user.Id) {
		return tooManyRequests()
	}

	group, events, err := s.chat.AddMembers(ctx, s.user.Id, req.ConversationId, req.UserIds)
	if err != nil {
		return failed(err)
	}

	reply := conversationUpdatedFrame(s.groupConversation(group))
	s.hub.publish(group.MemberIDs(), reply, s)
	for _, event := range events {
		target := memberName(group, *event.TargetID)
		s.hub.publish(group.MemberIDs(), messageCreatedFrame(named(toMessage(event), s.user.Username, &target)), nil)
	}
	return reply
}

func (s *session) removeGroupMember(ctx context.Context, req *protocol.RemoveGroupMember) *protocol.ServerFrame {
	if !s.guard.groupChanges.Allow(s.user.Id) {
		return tooManyRequests()
	}

	before, err := s.chat.Group(ctx, s.user.Id, req.ConversationId)
	if err != nil {
		return failed(err)
	}
	group, event, err := s.chat.RemoveMember(ctx, s.user.Id, req.ConversationId, req.UserId)
	if err != nil {
		return failed(err)
	}
	target := memberName(before, req.UserId)

	s.kickFromRoom(group.ID, req.UserId)
	s.hub.publish([]string{req.UserId}, conversationRemovedFrame(group.ID), nil)

	reply := conversationUpdatedFrame(s.groupConversation(group))
	s.hub.publish(group.MemberIDs(), reply, s)
	s.hub.publish(group.MemberIDs(), messageCreatedFrame(named(toMessage(event), s.user.Username, &target)), nil)
	return reply
}

func (s *session) leaveGroup(ctx context.Context, req *protocol.LeaveGroup) *protocol.ServerFrame {
	if !s.guard.groupChanges.Allow(s.user.Id) {
		return tooManyRequests()
	}
	group, event, err := s.chat.LeaveGroup(ctx, s.user.Id, req.ConversationId)
	if err != nil {
		return failed(err)
	}

	s.kickFromRoom(group.ID, s.user.Id)
	reply := conversationRemovedFrame(group.ID)
	s.hub.publish([]string{s.user.Id}, reply, s)

	if event != nil {
		s.hub.publish(group.MemberIDs(), conversationUpdatedFrame(s.groupConversation(group)), nil)
		self := s.user.Username
		s.hub.publish(group.MemberIDs(), messageCreatedFrame(named(toMessage(*event), self, &self)), nil)
	}
	return reply
}

func (s *session) transferGroup(ctx context.Context, req *protocol.TransferGroup) *protocol.ServerFrame {
	if !s.guard.groupChanges.Allow(s.user.Id) {
		return tooManyRequests()
	}

	group, event, err := s.chat.TransferOwner(ctx, s.user.Id, req.ConversationId, req.UserId)
	if err != nil {
		return failed(err)
	}

	reply := conversationUpdatedFrame(s.groupConversation(group))
	s.hub.publish(group.MemberIDs(), reply, s)
	target := memberName(group, req.UserId)
	s.hub.publish(group.MemberIDs(), messageCreatedFrame(named(toMessage(event), s.user.Username, &target)), nil)
	return reply
}

func (s *session) setGroupAvatar(ctx context.Context, req *protocol.SetGroupAvatar) *protocol.ServerFrame {
	if !s.guard.avatarChanges.Allow(s.user.Id) {
		return tooManyRequests()
	}

	var image []byte
	if len(req.Image) > 0 {
		image = req.Image
	}
	group, err := s.chat.SetGroupAvatar(ctx, s.user.Id, req.ConversationId, image)
	if err != nil {
		return failed(err)
	}

	reply := conversationUpdatedFrame(s.groupConversation(group))
	s.hub.publish(group.MemberIDs(), reply, s)
	return reply
}

func (s *session) deleteGroup(ctx context.Context, req *protocol.DeleteGroup) *protocol.ServerFrame {
	if !s.guard.groupChanges.Allow(s.user.Id) {
		return tooManyRequests()
	}

	memberIDs, err := s.chat.DeleteGroup(ctx, s.user.Id, req.ConversationId)
	if err != nil {
		return failed(err)
	}

	for _, memberID := range memberIDs {
		s.kickFromRoom(req.ConversationId, memberID)
	}
	reply := conversationRemovedFrame(req.ConversationId)
	s.hub.publish(memberIDs, reply, s)
	return reply
}

func (s *session) joinGroupCall(ctx context.Context, req *protocol.JoinGroupCall) *protocol.ServerFrame {
	if !s.guard.callStarts.Allow(s.user.Id) {
		return tooManyRequests()
	}

	group, err := s.chat.Group(ctx, s.user.Id, req.ConversationId)
	if err != nil {
		return failed(err)
	}
	if !s.rooms.exists(group.ID) && !s.guard.roomStarts.Allow(group.ID) {
		return tooManyRequests()
	}

	ice, err := s.iceServers(s.user.Id)
	if err != nil {
		return failed(err)
	}

	s.voice.Lock()
	if s.calls.busy(s.user.Id) {
		s.voice.Unlock()
		return errorFrame(protocol.ErrorCode_ERROR_CODE_UNAVAILABLE, "busy")
	}
	current, created, ok := s.rooms.join(group.ID, s)
	s.voice.Unlock()
	if !ok {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_UNAVAILABLE, "busy")
	}
	if member, err := s.chat.IsMember(ctx, group.ID, s.user.Id); err != nil || !member {
		s.leaveRoom()
		return failed(chat.ErrGroupNotFound)
	}

	members := group.MemberIDs()
	if created {
		me := &protocol.User{Id: s.user.Id, Username: s.user.Username, Avatar: s.user.Avatar}
		others := without(members, s.user.Id)
		s.rooms.ring(current.id, others, func() { s.announceRoom(group.ID) })
		s.hub.publish(others, groupCallRingingFrame(group.ID, me), nil)
		s.logGroupCall(ctx, current.id, group.ID, members)
	}

	state := s.rooms.state(group.ID)
	s.hub.publish(members, groupCallUpdatedFrame(group.ID, state), nil)

	var others []string
	if state != nil {
		others = without(state.ParticipantIds, s.user.Id)
	}
	return groupCallJoinedFrame(current.id, group.ID, ice, others)
}

func (s *session) leaveGroupCall() *protocol.ServerFrame {
	s.leaveRoom()
	return ackFrame()
}

func (s *session) declineGroupCall(req *protocol.DeclineGroupCall) *protocol.ServerFrame {
	if !s.guard.groupChanges.Allow(s.user.Id) {
		return tooManyRequests()
	}
	if s.rooms.unring(req.ConversationId, s.user.Id) {
		s.announceRoom(req.ConversationId)
	}
	return ackFrame()
}

func (s *session) leaveRoom() {
	conversationID, found := s.rooms.leave(s)
	if !found {
		return
	}
	s.announceRoom(conversationID)
}

func (s *session) kickFromRoom(conversationID, userID string) {
	unrung := s.rooms.unring(conversationID, userID)
	member := s.rooms.sessionOf(conversationID, userID)
	if member != nil {
		if _, found := s.rooms.leave(member); found {
			member.reply(groupCallUpdatedFrame(conversationID, nil))
			unrung = true
		}
	}
	if unrung {
		s.announceRoom(conversationID)
	}
}

func (s *session) announceRoom(conversationID string) {
	ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
	defer cancel()

	members, err := s.chat.ParticipantIDs(ctx, conversationID)
	if err != nil {
		slog.Error("load group members", "error", err)
		return
	}
	s.hub.publish(members, groupCallUpdatedFrame(conversationID, s.rooms.state(conversationID)), nil)
}

func (s *session) logGroupCall(ctx context.Context, roomID, groupID string, members []string) {
	message, err := s.chat.StartGroupCallMessage(ctx, groupID, s.user.Id)
	if err != nil {
		slog.Error("start group call message", "error", err)
		return
	}

	s.hub.publish(members, messageCreatedFrame(named(toMessage(message), s.user.Username, nil)), nil)
	if !s.rooms.attachMessage(roomID, message.ID) {
		go s.rooms.finish(groupID, message.ID, 0)
	}
}

func memberName(group chat.Group, userID string) string {
	for _, member := range group.Members {
		if member.ID == userID {
			return member.Username
		}
	}
	return ""
}

func without(values []string, exclude string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value != exclude {
			result = append(result, value)
		}
	}
	return result
}
