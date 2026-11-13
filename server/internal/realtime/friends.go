package realtime

import (
	"context"

	"ludra/internal/friends"
	"ludra/internal/protocol"
)

var friendStates = map[friends.State]protocol.FriendState{
	friends.Accepted: protocol.FriendState_FRIEND_STATE_ACCEPTED,
	friends.Incoming: protocol.FriendState_FRIEND_STATE_INCOMING,
	friends.Outgoing: protocol.FriendState_FRIEND_STATE_OUTGOING,
}

func (s *session) friend(friend friends.Friend) *protocol.Friend {
	user := &protocol.User{
		Id:       friend.ID,
		Username: friend.Username,
		Avatar:   friend.Avatar,
		Presence: protocol.Presence_PRESENCE_OFFLINE,
	}
	if friend.State == friends.Accepted {
		user.Presence = s.hub.presence(friend.ID)
	}
	return &protocol.Friend{User: user, State: friendStates[friend.State]}
}

func (s *session) listFriends(ctx context.Context) *protocol.ServerFrame {
	list, err := s.friends.List(ctx, s.user.Id)
	if err != nil {
		return failed(err)
	}

	result := make([]*protocol.Friend, len(list))
	for i, friend := range list {
		result[i] = s.friend(friend)
	}
	return friendListFrame(result)
}

func (s *session) addFriend(ctx context.Context, req *protocol.AddFriend) *protocol.ServerFrame {
	friend, err := s.friends.Add(ctx, s.user.Id, req.Username)
	if err != nil {
		return failed(err)
	}

	mirror := friends.Incoming
	if friend.State == friends.Accepted {
		mirror = friends.Accepted
	}
	return s.relate(friend, mirror)
}

func (s *session) acceptFriend(ctx context.Context, req *protocol.AcceptFriend) *protocol.ServerFrame {
	friend, err := s.friends.Accept(ctx, s.user.Id, req.UserId)
	if err != nil {
		return failed(err)
	}
	return s.relate(friend, friends.Accepted)
}

func (s *session) removeFriend(ctx context.Context, req *protocol.RemoveFriend) *protocol.ServerFrame {
	if err := s.friends.Remove(ctx, s.user.Id, req.UserId); err != nil {
		return failed(err)
	}

	reply := friendRemovedFrame(req.UserId)
	s.hub.publish([]string{s.user.Id}, reply, s)
	s.hub.publish([]string{req.UserId}, friendRemovedFrame(s.user.Id), nil)
	return reply
}

func (s *session) relate(friend friends.Friend, mirror friends.State) *protocol.ServerFrame {
	reply := friendUpdatedFrame(s.friend(friend))
	other := friendUpdatedFrame(s.friend(friends.Friend{ID: s.user.Id, Username: s.user.Username, Avatar: s.user.Avatar, State: mirror}))

	s.hub.publish([]string{s.user.Id}, reply, s)
	s.hub.publish([]string{friend.ID}, other, nil)
	return reply
}

func (s *session) setPresence(ctx context.Context, req *protocol.SetPresence) *protocol.ServerFrame {
	var invisible bool
	switch req.Presence {
	case protocol.Presence_PRESENCE_ONLINE:
	case protocol.Presence_PRESENCE_INVISIBLE:
		invisible = true
	default:
		return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST, "invalid presence")
	}

	if err := s.account.SetInvisible(ctx, s.user.Id, invisible); err != nil {
		return failed(err)
	}
	if s.hub.setInvisible(s.user.Id, invisible) {
		s.announce(s.hub.presence(s.user.Id))
	}

	reply := presenceChangedFrame(s.user.Id, req.Presence)
	s.hub.publish([]string{s.user.Id}, reply, s)
	return reply
}
