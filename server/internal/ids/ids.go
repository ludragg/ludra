package ids

import "regexp"

var pattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func Valid(id string) bool {
	return pattern.MatchString(id)
}
