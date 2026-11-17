package realtime

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	"ludra/internal/account"
	"ludra/internal/chat"
	"ludra/internal/database"
	"ludra/internal/protocol"
)

func errorFrame(code protocol.ErrorCode, message string) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_Error{
			Error: &protocol.Error{Code: code, Message: message},
		},
	}
}

func loggedInFrame(user *protocol.User, session account.Session) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_LoggedIn{
			LoggedIn: &protocol.LoggedIn{
				User:      user,
				Token:     session.Token,
				Email:     session.Email,
				TwoFactor: session.TwoFactor,
			},
		},
	}
}

func twoFactorRequiredFrame(email string) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_TwoFactorRequired{
			TwoFactorRequired: &protocol.TwoFactorRequired{Email: email},
		},
	}
}

func passwordChangedFrame() *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_PasswordChanged{PasswordChanged: &protocol.PasswordChanged{}},
	}
}

func twoFactorChangedFrame(enabled bool) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_TwoFactorChanged{
			TwoFactorChanged: &protocol.TwoFactorChanged{Enabled: enabled},
		},
	}
}

func userUpdatedFrame(user *protocol.User) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_UserUpdated{
			UserUpdated: &protocol.UserUpdated{User: user},
		},
	}
}

func verificationRequiredFrame(email string) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_VerificationRequired{
			VerificationRequired: &protocol.VerificationRequired{Email: email},
		},
	}
}

func codeSentFrame() *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_CodeSent{CodeSent: &protocol.CodeSent{}},
	}
}

func loggedOutFrame() *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_LoggedOut{LoggedOut: &protocol.LoggedOut{}},
	}
}

func conversationOpenedFrame(conversation *protocol.Conversation) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_ConversationOpened{
			ConversationOpened: &protocol.ConversationOpened{Conversation: conversation},
		},
	}
}

func conversationListFrame(list []*protocol.Conversation) *protocol.ServerFrame {

	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_ConversationList{
			ConversationList: &protocol.ConversationList{Conversations: list},
		},
	}
}

func messageHistoryFrame(conversationID string, messages []database.ListMessagesRow, hasMore bool) *protocol.ServerFrame {
	list := make([]*protocol.Message, len(messages))
	for i, row := range messages {
		list[i] = named(toMessage(row.Message), row.SenderName, row.TargetName)
	}

	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_MessageHistory{
			MessageHistory: &protocol.MessageHistory{ConversationId: conversationID, Messages: list, HasMore: hasMore},
		},
	}
}

func messageCreatedFrame(message *protocol.Message) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_MessageCreated{
			MessageCreated: &protocol.MessageCreated{Message: message},
		},
	}
}

func presenceChangedFrame(userID string, presence protocol.Presence) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_PresenceChanged{
			PresenceChanged: &protocol.PresenceChanged{UserId: userID, Presence: presence},
		},
	}
}

func friendListFrame(friends []*protocol.Friend) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_FriendList{
			FriendList: &protocol.FriendList{Friends: friends},
		},
	}
}

func friendUpdatedFrame(friend *protocol.Friend) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_FriendUpdated{
			FriendUpdated: &protocol.FriendUpdated{Friend: friend},
		},
	}
}

func blockedListFrame(users []*protocol.User) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_BlockedList{
			BlockedList: &protocol.BlockedList{Users: users},
		},
	}
}

func friendRemovedFrame(userID string) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_FriendRemoved{
			FriendRemoved: &protocol.FriendRemoved{UserId: userID},
		},
	}
}

func callStartedFrame(call *protocol.Call) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_CallStarted{CallStarted: &protocol.CallStarted{Call: call}},
	}
}

func callIncomingFrame(call *protocol.Call) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_CallIncoming{CallIncoming: &protocol.CallIncoming{Call: call}},
	}
}

func callAcceptedFrame(callID string, direct bool) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_CallAccepted{CallAccepted: &protocol.CallAccepted{CallId: callID, Direct: direct}},
	}
}

func callEndedFrame(callID string, reason protocol.CallEndReason) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_CallEnded{CallEnded: &protocol.CallEnded{CallId: callID, Reason: reason}},
	}
}

func callSignalFrame(signal *protocol.CallSignal) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_CallSignal{CallSignal: signal},
	}
}

func messageUpdatedFrame(message *protocol.Message) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_MessageUpdated{MessageUpdated: &protocol.MessageUpdated{Message: message}},
	}
}

func conversationUpdatedFrame(conversation *protocol.Conversation) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_ConversationUpdated{
			ConversationUpdated: &protocol.ConversationUpdated{Conversation: conversation},
		},
	}
}

func conversationRemovedFrame(conversationID string) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_ConversationRemoved{
			ConversationRemoved: &protocol.ConversationRemoved{ConversationId: conversationID},
		},
	}
}

func groupCallJoinedFrame(callID, conversationID string, ice []*protocol.IceServer, participants []string) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_GroupCallJoined{GroupCallJoined: &protocol.GroupCallJoined{
			CallId:         callID,
			ConversationId: conversationID,
			IceServers:     ice,
			ParticipantIds: participants,
		}},
	}
}

func groupCallUpdatedFrame(conversationID string, call *protocol.GroupCall) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_GroupCallUpdated{
			GroupCallUpdated: &protocol.GroupCallUpdated{ConversationId: conversationID, Call: call},
		},
	}
}

func groupCallRingingFrame(conversationID string, starter *protocol.User) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_GroupCallRinging{
			GroupCallRinging: &protocol.GroupCallRinging{ConversationId: conversationID, Starter: starter},
		},
	}
}

func ackFrame() *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_Ack{Ack: &protocol.Ack{}},
	}
}

func toUser(user database.User) *protocol.User {
	return &protocol.User{Id: user.ID, Username: user.Username, Avatar: user.Avatar}
}

func toConversation(conversation chat.Conversation) *protocol.Conversation {
	result := &protocol.Conversation{
		Id:   conversation.ID,
		Peer: toUser(conversation.Peer),
		Kind: protocol.ConversationKind_CONVERSATION_KIND_DIRECT,
	}
	if conversation.LastMessage != nil {
		result.LastMessage = toMessage(*conversation.LastMessage)
	}
	return result
}

var callOutcomes = map[string]protocol.CallOutcome{
	"completed": protocol.CallOutcome_CALL_OUTCOME_COMPLETED,
	"declined":  protocol.CallOutcome_CALL_OUTCOME_DECLINED,
	"missed":    protocol.CallOutcome_CALL_OUTCOME_MISSED,
	"ongoing":   protocol.CallOutcome_CALL_OUTCOME_ONGOING,
}

func named(message *protocol.Message, sender string, target *string) *protocol.Message {
	message.SenderName = sender
	if target != nil {
		message.TargetName = *target
	}
	return message
}

func toGroupConversation(group chat.Group, call *protocol.GroupCall) *protocol.Conversation {
	members := make([]*protocol.User, len(group.Members))
	for i, member := range group.Members {
		members[i] = toUser(member)
	}

	result := &protocol.Conversation{
		Id:      group.ID,
		Kind:    protocol.ConversationKind_CONVERSATION_KIND_GROUP,
		Name:    group.Name,
		OwnerId: group.OwnerID,
		Avatar:  group.Avatar,
		Members: members,
		Call:    call,
	}
	if group.LastMessage != nil {
		result.LastMessage = named(toMessage(*group.LastMessage), group.LastSenderName, group.LastTargetName)
	}
	return result
}

var messageEvents = map[string]protocol.MessageEvent{
	"member_added":   protocol.MessageEvent_MESSAGE_EVENT_MEMBER_ADDED,
	"member_removed": protocol.MessageEvent_MESSAGE_EVENT_MEMBER_REMOVED,
	"member_left":    protocol.MessageEvent_MESSAGE_EVENT_MEMBER_LEFT,
	"owner_changed":  protocol.MessageEvent_MESSAGE_EVENT_OWNER_CHANGED,
}

func toMessage(message database.Message) *protocol.Message {
	result := &protocol.Message{
		Id:             message.ID,
		ConversationId: message.ConversationID,
		SenderId:       message.SenderID,
		Content:        message.Content,
		SentAt:         timestamppb.New(message.CreatedAt),
		Kind:           protocol.MessageKind_MESSAGE_KIND_TEXT,
	}

	if message.Kind == "event" {
		result.Kind = protocol.MessageKind_MESSAGE_KIND_EVENT
		if message.Event != nil {
			result.Event = messageEvents[*message.Event]
		}
		if message.TargetID != nil {
			result.TargetId = *message.TargetID
		}
	}

	if message.Kind == "call" {
		result.Kind = protocol.MessageKind_MESSAGE_KIND_CALL
		if message.CallOutcome != nil {
			result.CallOutcome = callOutcomes[*message.CallOutcome]
		}
		if message.CallDuration != nil {
			result.CallDuration = uint32(*message.CallDuration)
		}
	}
	return result
}
