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

func messageHistoryFrame(conversationID string, messages []database.Message, hasMore bool) *protocol.ServerFrame {
	list := make([]*protocol.Message, len(messages))
	for i, message := range messages {
		list[i] = toMessage(message)
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

func callAcceptedFrame(callID string) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_CallAccepted{CallAccepted: &protocol.CallAccepted{CallId: callID}},
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

func ackFrame() *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_Ack{Ack: &protocol.Ack{}},
	}
}

func toUser(user database.User) *protocol.User {
	return &protocol.User{Id: user.ID, Username: user.Username, Avatar: user.Avatar}
}

func toConversation(conversation chat.Conversation) *protocol.Conversation {
	result := &protocol.Conversation{Id: conversation.ID, Peer: toUser(conversation.Peer)}
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

func toMessage(message database.Message) *protocol.Message {
	result := &protocol.Message{
		Id:             message.ID,
		ConversationId: message.ConversationID,
		SenderId:       message.SenderID,
		Content:        message.Content,
		SentAt:         timestamppb.New(message.CreatedAt),
		Kind:           protocol.MessageKind_MESSAGE_KIND_TEXT,
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
