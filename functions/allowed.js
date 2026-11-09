// Whether an IP address is in the allowed list (addresses or CIDR ranges,
// IPv4 or IPv6). An empty list allows nothing.
const net = require("node:net");

// The allowed list as a BlockList (used here as an allow list).
function allowList(entries) {
  const list = new net.BlockList();
  let count = 0;
  for (const raw of Array.isArray(entries) ? entries : []) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    const [address, prefix] = text.split("/");
    const type = net.isIPv6(address) ? "ipv6" : net.isIPv4(address) ? "ipv4" : null;
    if (!type) continue;
    if (prefix === undefined) list.addAddress(address, type);
    else list.addSubnet(address, Number(prefix), type);
    count++;
  }
  return { list, count };
}

// "::ffff:203.0.113.7" (IPv4 written as IPv6) -> "203.0.113.7".
function plainIp(ip) {
  const text = String(ip ?? "").trim();
  const mapped = text.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mapped ? mapped[1] : text;
}

function isAllowed(ip, entries) {
  const { list, count } = allowList(entries);
  if (count === 0) return false;
  const address = plainIp(ip);
  const type = net.isIPv6(address) ? "ipv6" : net.isIPv4(address) ? "ipv4" : null;
  return !!type && list.check(address, type);
}

module.exports = { isAllowed };
