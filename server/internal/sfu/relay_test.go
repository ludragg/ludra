package sfu

import (
	"context"
	"testing"
	"time"

	"github.com/pion/rtcp"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
)

const streamID = "call/publisher"

func offerOf(t *testing.T, connection *webrtc.PeerConnection) string {
	t.Helper()
	offer, err := connection.CreateOffer(nil)
	if err != nil {
		t.Fatal(err)
	}
	gathered := webrtc.GatheringCompletePromise(connection)
	if err := connection.SetLocalDescription(offer); err != nil {
		t.Fatal(err)
	}
	<-gathered
	return connection.LocalDescription().SDP
}

func answerTo(t *testing.T, connection *webrtc.PeerConnection, answer string) {
	t.Helper()
	description := webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: answer}
	if err := connection.SetRemoteDescription(description); err != nil {
		t.Fatal(err)
	}
}

func TestRelayForwardsMediaAndKeyframeRequests(t *testing.T) {
	relay, err := New(nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	publisher, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	defer publisher.Close()
	capability := webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeVP9, ClockRate: 90000}
	source, err := webrtc.NewTrackLocalStaticRTP(capability, "video", "screen")
	if err != nil {
		t.Fatal(err)
	}
	sender, err := publisher.AddTrack(source)
	if err != nil {
		t.Fatal(err)
	}

	keyframes := make(chan struct{}, 1)
	go func() {
		for {
			packets, _, err := sender.ReadRTCP()
			if err != nil {
				return
			}
			for _, packet := range packets {
				if _, ok := packet.(*rtcp.PictureLossIndication); ok {
					select {
					case keyframes <- struct{}{}:
					default:
					}
				}
			}
		}
	}()

	published, err := relay.Publish(streamID, offerOf(t, publisher))
	if err != nil {
		t.Fatal(err)
	}
	answerTo(t, publisher, published)

	go func() {
		payload := []byte("sealed frame")
		for sequence := uint16(0); ctx.Err() == nil; sequence++ {
			source.WriteRTP(&rtp.Packet{
				Header:  rtp.Header{Version: 2, SequenceNumber: sequence, Timestamp: uint32(sequence) * 3000},
				Payload: payload,
			})
			time.Sleep(20 * time.Millisecond)
		}
	}()

	viewer, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	defer viewer.Close()
	direction := webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly}
	if _, err := viewer.AddTransceiverFromKind(webrtc.RTPCodecTypeVideo, direction); err != nil {
		t.Fatal(err)
	}
	received := make(chan string, 1)
	viewer.OnTrack(func(remote *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		packet, _, err := remote.ReadRTP()
		if err == nil {
			received <- string(packet.Payload)
		}
	})

	subscribed, err := relay.Subscribe(ctx, streamID, "viewer", offerOf(t, viewer))
	if err != nil {
		t.Fatal(err)
	}
	answerTo(t, viewer, subscribed)

	select {
	case payload := <-received:
		if payload != "sealed frame" {
			t.Fatalf("payload changed in transit: %q", payload)
		}
	case <-ctx.Done():
		t.Fatal("viewer received no media")
	}

	select {
	case <-keyframes:
	case <-ctx.Done():
		t.Fatal("publisher received no keyframe request")
	}

	relay.Unpublish(streamID)
	if _, err := relay.Subscribe(ctx, streamID, "late", ""); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound after unpublish, got %v", err)
	}
}
