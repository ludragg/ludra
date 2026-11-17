package sfu

import (
	"context"
	"errors"
	"io"
	"net"
	"sync"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v4"
)

const keyframeInterval = 500 * time.Millisecond

var ErrNotFound = errors.New("stream not found")

type Relay struct {
	api     *webrtc.API
	mu      sync.Mutex
	streams map[string]*stream
}

type stream struct {
	publisher *webrtc.PeerConnection
	expected  int
	ready     chan struct{}
	mu        sync.Mutex
	tracks    []relayed
	viewers   map[string]*webrtc.PeerConnection
	requested time.Time
}

type relayed struct {
	local *webrtc.TrackLocalStaticRTP
	ssrc  uint32
	video bool
}

func New(listener net.PacketConn, addresses []string) (*Relay, error) {
	settings := webrtc.SettingEngine{}
	if listener != nil {
		settings.SetICEUDPMux(webrtc.NewICEUDPMux(nil, listener))
	}
	if len(addresses) > 0 {
		settings.SetNAT1To1IPs(addresses, webrtc.ICECandidateTypeHost)
	}

	media := &webrtc.MediaEngine{}
	if err := media.RegisterDefaultCodecs(); err != nil {
		return nil, err
	}
	registry := &interceptor.Registry{}
	if err := webrtc.RegisterDefaultInterceptors(media, registry); err != nil {
		return nil, err
	}

	api := webrtc.NewAPI(
		webrtc.WithSettingEngine(settings),
		webrtc.WithMediaEngine(media),
		webrtc.WithInterceptorRegistry(registry),
	)
	return &Relay{api: api, streams: make(map[string]*stream)}, nil
}

func (r *Relay) Publish(id, offer string) (string, error) {
	connection, err := r.api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		return "", err
	}
	current := &stream{
		publisher: connection,
		ready:     make(chan struct{}),
		viewers:   make(map[string]*webrtc.PeerConnection),
	}

	connection.OnTrack(func(remote *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		local, err := webrtc.NewTrackLocalStaticRTP(remote.Codec().RTPCodecCapability, remote.ID(), remote.StreamID())
		if err != nil {
			return
		}
		current.add(relayed{local: local, ssrc: uint32(remote.SSRC()), video: remote.Kind() == webrtc.RTPCodecTypeVideo})
		forward(remote, local)
	})
	connection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		if state == webrtc.PeerConnectionStateFailed || state == webrtc.PeerConnectionStateClosed {
			r.drop(id, current)
		}
	})

	answer, err := accept(connection, offer)
	if err != nil {
		connection.Close()
		return "", err
	}
	current.expect(len(connection.GetTransceivers()))

	r.mu.Lock()
	previous := r.streams[id]
	r.streams[id] = current
	r.mu.Unlock()
	if previous != nil {
		previous.close()
	}
	return answer, nil
}

func (r *Relay) Subscribe(ctx context.Context, id, viewer, offer string) (string, error) {
	r.mu.Lock()
	current := r.streams[id]
	r.mu.Unlock()
	if current == nil {
		return "", ErrNotFound
	}

	select {
	case <-current.ready:
	case <-ctx.Done():
		return "", ctx.Err()
	}

	connection, err := r.api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		return "", err
	}
	for _, track := range current.list() {
		sender, err := connection.AddTrack(track.local)
		if err != nil {
			connection.Close()
			return "", err
		}
		go current.feedback(sender)
	}
	connection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		switch state {
		case webrtc.PeerConnectionStateConnected:
			current.requestKeyframe(true)
		case webrtc.PeerConnectionStateFailed:
			current.remove(viewer, connection)
		}
	})

	answer, err := accept(connection, offer)
	if err != nil {
		connection.Close()
		return "", err
	}
	if !current.attach(viewer, connection) {
		connection.Close()
		return "", ErrNotFound
	}
	return answer, nil
}

func (r *Relay) Unsubscribe(id, viewer string) {
	r.mu.Lock()
	current := r.streams[id]
	r.mu.Unlock()
	if current != nil {
		current.remove(viewer, nil)
	}
}

func (r *Relay) Unpublish(id string) {
	r.drop(id, nil)
}

func (r *Relay) drop(id string, only *stream) {
	r.mu.Lock()
	current := r.streams[id]
	if current == nil || (only != nil && current != only) {
		r.mu.Unlock()
		return
	}
	delete(r.streams, id)
	r.mu.Unlock()
	current.close()
}

func (s *stream) expect(count int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.expected = count
	if count > 0 && len(s.tracks) == count {
		close(s.ready)
	}
}

func (s *stream) add(track relayed) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.tracks = append(s.tracks, track)
	if len(s.tracks) == s.expected {
		close(s.ready)
	}
}

func (s *stream) list() []relayed {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]relayed(nil), s.tracks...)
}

func (s *stream) attach(viewer string, connection *webrtc.PeerConnection) bool {
	s.mu.Lock()
	if s.viewers == nil {
		s.mu.Unlock()
		return false
	}
	previous := s.viewers[viewer]
	s.viewers[viewer] = connection
	s.mu.Unlock()

	if previous != nil {
		previous.Close()
	}
	return true
}

func (s *stream) remove(viewer string, only *webrtc.PeerConnection) {
	s.mu.Lock()
	connection := s.viewers[viewer]
	if connection == nil || (only != nil && connection != only) {
		s.mu.Unlock()
		return
	}
	delete(s.viewers, viewer)
	s.mu.Unlock()
	connection.Close()
}

func (s *stream) close() {
	s.mu.Lock()
	viewers := s.viewers
	s.viewers = nil
	s.mu.Unlock()

	for _, connection := range viewers {
		connection.Close()
	}
	s.publisher.Close()
}

func (s *stream) feedback(sender *webrtc.RTPSender) {
	for {
		packets, _, err := sender.ReadRTCP()
		if err != nil {
			return
		}
		for _, packet := range packets {
			switch packet.(type) {
			case *rtcp.PictureLossIndication, *rtcp.FullIntraRequest:
				s.requestKeyframe(false)
			}
		}
	}
}

func (s *stream) requestKeyframe(force bool) {
	s.mu.Lock()
	if !force && time.Since(s.requested) < keyframeInterval {
		s.mu.Unlock()
		return
	}
	s.requested = time.Now()
	var packets []rtcp.Packet
	for _, track := range s.tracks {
		if track.video {
			packets = append(packets, &rtcp.PictureLossIndication{MediaSSRC: track.ssrc})
		}
	}
	s.mu.Unlock()

	if len(packets) > 0 {
		s.publisher.WriteRTCP(packets)
	}
}

func forward(remote *webrtc.TrackRemote, local *webrtc.TrackLocalStaticRTP) {
	buffer := make([]byte, 1500)
	for {
		size, _, err := remote.Read(buffer)
		if err != nil {
			return
		}
		if _, err := local.Write(buffer[:size]); err != nil && !errors.Is(err, io.ErrClosedPipe) {
			return
		}
	}
}

func accept(connection *webrtc.PeerConnection, offer string) (string, error) {
	description := webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: offer}
	if err := connection.SetRemoteDescription(description); err != nil {
		return "", err
	}
	answer, err := connection.CreateAnswer(nil)
	if err != nil {
		return "", err
	}
	gathered := webrtc.GatheringCompletePromise(connection)
	if err := connection.SetLocalDescription(answer); err != nil {
		return "", err
	}
	<-gathered
	return connection.LocalDescription().SDP, nil
}
