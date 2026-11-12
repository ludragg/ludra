package realtime

import (
	"google.golang.org/protobuf/types/known/timestamppb"

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

func loggedInFrame(user *protocol.User) *protocol.ServerFrame {
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_LoggedIn{
			LoggedIn: &protocol.LoggedIn{User: user},
		},
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

func toUser(user database.User) *protocol.User {
	return &protocol.User{Id: user.ID, Username: user.Username}
}

func toConversation(conversation chat.Conversation) *protocol.Conversation {
	result := &protocol.Conversation{Id: conversation.ID, Peer: toUser(conversation.Peer)}
	if conversation.LastMessage != nil {
		result.LastMessage = toMessage(*conversation.LastMessage)
	}
	return result
}

func toMessage(message database.Message) *protocol.Message {
	return &protocol.Message{
		Id:             message.ID,
		ConversationId: message.ConversationID,
		SenderId:       message.SenderID,
		Content:        message.Content,
		SentAt:         timestamppb.New(message.CreatedAt),
	}
}
