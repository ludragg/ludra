package limit

import (
	"sync"
	"time"
)

const sweepEvery = 1024

type Limiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	entries map[string]*entry
	calls   int
}

type entry struct {
	count int
	reset time.Time
}

func New(limit int, window time.Duration) *Limiter {
	return &Limiter{limit: limit, window: window, entries: make(map[string]*entry)}
}

func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	l.sweep(now)

	current, ok := l.entries[key]
	if !ok || now.After(current.reset) {
		l.entries[key] = &entry{count: 1, reset: now.Add(l.window)}
		return true
	}
	if current.count >= l.limit {
		return false
	}
	current.count++
	return true
}

func (l *Limiter) sweep(now time.Time) {
	l.calls++
	if l.calls < sweepEvery {
		return
	}
	l.calls = 0
	for key, current := range l.entries {
		if now.After(current.reset) {
			delete(l.entries, key)
		}
	}
}
