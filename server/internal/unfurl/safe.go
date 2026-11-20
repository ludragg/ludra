package unfurl

import (
	"errors"
	"net/netip"
	"syscall"
)

var errBlockedAddress = errors.New("blocked address")

var blockedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("64:ff9b::/96"),
	netip.MustParsePrefix("64:ff9b:1::/48"),
	netip.MustParsePrefix("::/96"),
	netip.MustParsePrefix("100::/64"),
	netip.MustParsePrefix("2001:db8::/32"),
}

func safeDial(network, address string, _ syscall.RawConn) error {
	if network != "tcp4" && network != "tcp6" {
		return errBlockedAddress
	}
	addrPort, err := netip.ParseAddrPort(address)
	if err != nil {
		return errBlockedAddress
	}
	if port := addrPort.Port(); port != 80 && port != 443 {
		return errBlockedAddress
	}
	if !public(addrPort.Addr().Unmap()) {
		return errBlockedAddress
	}
	return nil
}

func public(addr netip.Addr) bool {
	if !addr.IsGlobalUnicast() || addr.IsPrivate() || addr.IsLoopback() || addr.IsLinkLocalUnicast() {
		return false
	}
	for _, prefix := range blockedPrefixes {
		if prefix.Contains(addr) {
			return false
		}
	}
	return true
}
