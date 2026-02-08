# Public VPN Configuration for Security Testing

> **WARNING:** Public/free VPNs should ONLY be used for educational testing on authorized systems. They may log traffic, be slow, or be honeypots. For professional pentesting, use paid VPNs (Mullvad, ProtonVPN, IVPN) or your own VPS.

---

## When to Use VPNs

**Good reasons:**
- Hide your real IP from test targets (rate limiting bypass)
- Test geo-restricted features
- Simulate attacks from different locations
- Practice OPSEC for educational purposes

**Bad reasons:**
- Hiding illegal activity (doesn't work, logs exist)
- Testing without authorization (still illegal)
- "Staying anonymous" (public VPNs log everything)

**Rule:** VPNs don't make unauthorized testing legal. You still need authorization.

---

## Free Public VPN Services

### 1. **FreeVPN.us** (Recommended for testing)
- **URL:** https://www.freevpn.us/openvpn/
- **Features:**
  - Free OpenVPN accounts
  - Active for 7+ days
  - Multiple server locations
  - Unlimited bandwidth
- **Setup:**
  1. Visit https://www.freevpn.us/openvpn/
  2. Create free account (email required)
  3. Download .ovpn config file
  4. Use with OpenVPN client

### 2. **TCPVPN.com**
- **URL:** https://tcpvpn.com/
- **Features:**
  - Free OpenVPN + PPTP
  - Unlimited bandwidth
  - High-speed access
  - Works on Android, PC, iPhone, Mac
- **Setup:**
  1. Visit https://tcpvpn.com/
  2. Select server location
  3. Create account (automatic)
  4. Download config file

### 3. **VPN Jantit**
- **URL:** https://www.vpnjantit.com/free-openvpn
- **Features:**
  - 62 countries, 92 cities
  - Unlimited bandwidth
  - Active up to 7 days
  - Free SSH included
- **Setup:**
  1. Visit https://www.vpnjantit.com/free-openvpn
  2. Choose server location
  3. Create account
  4. Download .ovpn file

### 4. **OpenTunnel.net**
- **URL:** https://opentunnel.net/openvpn/
- **Features:**
  - Premium quality, always free
  - Multiple protocols
  - No registration required
- **Setup:**
  1. Visit https://opentunnel.net/openvpn/
  2. Select server
  3. Download config
  4. Connect

### 5. **VPNGate (University of Tsukuba, Japan)**
- **URL:** https://www.vpngate.net/
- **Features:**
  - Academic research project
  - Completely free
  - Volunteer-run servers
  - OpenVPN + L2TP configs
- **Setup:**
  1. Visit https://www.vpngate.net/
  2. Browse server list
  3. Download .ovpn file
  4. Connect with OpenVPN

---

## OpenVPN Setup (macOS/Linux)

### Install OpenVPN

**macOS:**
```bash
brew install openvpn
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get install openvpn
```

### Connect to VPN

```bash
# Download .ovpn config from provider
cd ~/Downloads

# Connect
sudo openvpn --config vpn-config.ovpn

# Or with credentials
sudo openvpn --config vpn-config.ovpn --auth-user-pass credentials.txt
```

**credentials.txt:**
```
username
password
```

### Verify connection

```bash
# Check IP (should show VPN IP, not your real IP)
curl ifconfig.me

# Check DNS leaks
curl https://dns.google/resolve?name=example.com
```

---

## Integrating VPN with Brute Force Tools

### Method 1: Run tool through VPN

```bash
# Terminal 1: Start VPN
sudo openvpn --config vpn.ovpn

# Terminal 2: Run brute forcer
node brute-force/tools/brute-force-login.js --target http://target.com/login --username admin --wordlist brute-force/wordlists/test-passwords.txt
```

### Method 2: Use SOCKS proxy

```bash
# Install torsocks (routes traffic through Tor/SOCKS)
brew install torsocks

# Run brute forcer through proxy
torsocks node brute-force/tools/brute-force-login.js --target http://target.com/login
```

### Method 3: Configure proxy in code

Update `brute-force-login.js`:

```javascript
const options = {
  hostname: targetUrl.hostname,
  port: targetUrl.port,
  path: targetUrl.pathname,
  method: 'POST',
  headers: { ... },
  // Add proxy
  agent: new require('https-proxy-agent')('http://vpn-proxy:port')
};
```

---

## DIY VPN (Better option)

### Set up your own VPN on DigitalOcean/AWS

**Why better:**
- You control logs (delete them)
- Faster speeds
- Not shared with other users
- Can be destroyed after testing

**Cost:** $5-10/month

**Setup with WireGuard:**

```bash
# On VPS (Ubuntu)
curl -O https://raw.githubusercontent.com/angristan/wireguard-install/master/wireguard-install.sh
chmod +x wireguard-install.sh
sudo ./wireguard-install.sh

# Follow prompts
# Download client config
# Connect from your machine
```

---

## VPN Safety Checklist

Before using VPN for security testing:

- [ ] I have authorization to test the target system
- [ ] I understand the VPN may log my traffic
- [ ] I'm using this for educational purposes only
- [ ] I have a kill switch configured (disconnect if VPN drops)
- [ ] I've verified my IP is masked (curl ifconfig.me)
- [ ] I've checked for DNS leaks
- [ ] I'm not using this to hide illegal activity

---

## Paid VPN Options (Recommended for professional use)

### Best for Pentesting

**1. Mullvad** ($5/month)
- No logs policy
- Accepts crypto
- Owned by security-focused company
- WireGuard support

**2. ProtonVPN** (Free tier available, $5-10/month paid)
- Swiss jurisdiction (strong privacy laws)
- No logs
- Secure Core (multi-hop)
- P2F (port forwarding for reverse shells)

**3. IVPN** ($6-10/month)
- No logs, audited
- Multi-hop
- Anonymous signup
- WireGuard + OpenVPN

---

## Common Issues & Fixes

### VPN won't connect

```bash
# Check OpenVPN version
openvpn --version

# Try with sudo
sudo openvpn --config vpn.ovpn

# Check logs
sudo openvpn --config vpn.ovpn --verb 6
```

### IP still leaking

```bash
# Install ufw (firewall)
sudo ufw enable

# Block all traffic except through VPN
sudo ufw default deny outgoing
sudo ufw allow out on tun0
```

### Slow speeds

- Try different server location (closer = faster)
- Use WireGuard instead of OpenVPN (faster protocol)
- Pay for premium VPN (free VPNs are always slow)

---

## Legal Warning

**Using a VPN does NOT make unauthorized access legal.**

- Computer Fraud and Abuse Act (CFAA) - 18 USC 1030
- Penalties: 10-20 years prison
- VPN providers comply with law enforcement
- Logs can be subpoenaed
- "Anonymous" VPNs aren't truly anonymous

**Get authorization before testing. Period.**

---

## Resources

**Free VPN Providers:**
- [FreeVPN.us](https://www.freevpn.us/openvpn/)
- [TCPVPN.com](https://tcpvpn.com/)
- [VPN Jantit](https://www.vpnjantit.com/free-openvpn)
- [OpenTunnel.net](https://opentunnel.net/openvpn/)
- [VPNGate](https://www.vpngate.net/)

**Tools:**
- [OpenVPN](https://openvpn.net/)
- [WireGuard](https://www.wireguard.com/)
- [GitHub: Free OVPN Files](https://github.com/Zoult/.ovpn)

**Paid VPNs:**
- [Mullvad](https://mullvad.net/)
- [ProtonVPN](https://protonvpn.com/)
- [IVPN](https://www.ivpn.net/)

---

**Remember:** The best defense against getting caught doing something illegal is... not doing illegal things. Get authorization first.
