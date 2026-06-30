# Port Conflict Resolver

Route `/port-conflicts` maps each TCP listener to a PID and process name. A conflict exists only when one port has more than one distinct PID; IPv4/IPv6 bindings from the same PID are not a conflict.

Cards: unique listening ports, public bindings, conflicts, protected bindings. Rows show address, port, PID, process, loopback/public state, and protection. Resolution begins with inspection; no “free port” shortcut bypasses identity or confirmation.

© CODINFY PLATFORMS SASU · codinfy.com
