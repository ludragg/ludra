package realtime

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"ludra/internal/chat"
	"ludra/internal/database"
	"ludra/internal/protocol"
	"ludra/internal/unfurl"
)

const previewTimeout = 20 * time.Second

func (s *session) sendImage(ctx context.Context, conversationID, replyToID string, data []byte) *protocol.ServerFrame {
	message, image, recipients, err := s.chat.SendImage(ctx, s.user.Id, conversationID, replyToID, data)
	if err != nil {
		return failed(err)
	}

	result := named(toMessage(message), s.user.Username, nil)
	result.Image = imageRef(image)
	frame := messageCreatedFrame(result)
	s.hub.publish(recipients, frame, s)
	return frame
}

func (s *session) getImage(ctx context.Context, req *protocol.GetImage) *protocol.ServerFrame {
	image, err := s.chat.GetImage(ctx, s.user.Id, req.Id, req.Offset)
	if err != nil {
		return failed(err)
	}
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_ImageData{
			ImageData: &protocol.ImageData{
				Id:     req.Id,
				Data:   image.Data,
				Mime:   image.Mime,
				Offset: req.Offset,
				Total:  uint32(image.Total),
			},
		},
	}
}

func (s *session) searchGifs(ctx context.Context, req *protocol.SearchGifs) *protocol.ServerFrame {
	list, next, err := s.gifs.Search(ctx, req.Query, req.Pos, req.Locale)
	if err != nil {
		return failed(err)
	}
	result := make([]*protocol.Gif, len(list))
	for i, gif := range list {
		result[i] = &protocol.Gif{
			Id:     gif.ID,
			Title:  gif.Title,
			Width:  uint32(gif.PreviewWidth),
			Height: uint32(gif.PreviewHeight),
		}
	}
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_GifResults{GifResults: &protocol.GifResults{Gifs: result, Next: next}},
	}
}

func (s *session) gifPreview(ctx context.Context, req *protocol.GetGifPreview) *protocol.ServerFrame {
	data, err := s.gifs.Preview(ctx, req.Id)
	if err != nil {
		return failed(err)
	}
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_ImageData{
			ImageData: &protocol.ImageData{Id: req.Id, Data: data, Mime: "image/gif", Total: uint32(len(data))},
		},
	}
}

func (s *session) sendGif(ctx context.Context, req *protocol.SendGif) *protocol.ServerFrame {
	data, err := s.gifs.Full(ctx, req.Id)
	if err != nil {
		return failed(err)
	}
	return s.sendImage(ctx, req.ConversationId, req.ReplyToId, data)
}

func (s *session) removePreview(ctx context.Context, req *protocol.RemovePreview) *protocol.ServerFrame {
	message, recipients, err := s.chat.RemovePreview(ctx, s.user.Id, req.MessageId)
	if err != nil {
		return failed(err)
	}

	frame := messageUpdatedFrame(named(toMessage(message), s.user.Username, nil))
	s.hub.publish(recipients, frame, s)
	return frame
}

func (s *session) unfurl(ctx context.Context, message database.Message) {
	link, ok := unfurl.FirstLink(message.Content)
	if !ok {
		return
	}
	sender := s.user.Username

	go func() {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), previewTimeout)
		defer cancel()

		preview, ok := s.previews.Fetch(ctx, link.URL)
		if !ok {
			return
		}
		updated, image, recipients, err := s.chat.SetPreview(ctx, message.ID, link.Text, preview)
		if errors.Is(err, chat.ErrMessageNotFound) {
			return
		}
		if err != nil {
			slog.Warn("save link preview", "error", err)
			return
		}

		result := named(toMessage(updated), sender, nil)
		if image != nil && result.Preview != nil {
			result.Preview.Image = imageRef(*image)
		}
		s.hub.publish(recipients, messageUpdatedFrame(result), nil)
	}()
}

func imageRef(image chat.Image) *protocol.ImageRef {
	return &protocol.ImageRef{Id: image.ID, Width: uint32(image.Width), Height: uint32(image.Height)}
}

func text(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
