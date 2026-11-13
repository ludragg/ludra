package limit

import "sync"

type Counter struct {
	mu     sync.Mutex
	max    int
	active map[string]int
}

func NewCounter(max int) *Counter {
	return &Counter{max: max, active: make(map[string]int)}
}

func (c *Counter) Acquire(key string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.active[key] >= c.max {
		return false
	}
	c.active[key]++
	return true
}

func (c *Counter) Release(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.active[key]--
	if c.active[key] <= 0 {
		delete(c.active, key)
	}
}
