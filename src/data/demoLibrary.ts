import { LibraryResourceMeta } from '../lib/library';

export const DEMO_LIBRARY_RESOURCES: (LibraryResourceMeta & { content: string })[] = [
  {
    id: 'demo-ccna-net-fundamentals',
    title: 'CCNA 200-301 — Comprehensive Networking Fundamentals',
    subject: 'Networking',
    description: 'Complete breakdown of OSI Layers, TCP/IP Suite, Encapsulation, and Subnetting math for CCNA candidates.',
    tags: ['CCNA', 'OSI Model', 'TCP/IP', 'Subnetting'],
    fileType: 'docx',
    originalFileName: 'CCNA_Module_1_Fundamentals.docx',
    authorName: 'Cisco Certified Study Group',
    authorId: 'system-demo-1',
    createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
    views: 342,
    importsCount: 89,
    wordCount: 1450,
    estimatedReadTime: 7,
    content: `## Section 1: The OSI & TCP/IP Reference Models

The **OSI (Open Systems Interconnection)** model defines 7 distinct layers for network communication:

1. **Application (Layer 7)** — HTTP, HTTPS, FTP, SSH, DNS, DHCP
2. **Presentation (Layer 6)** — Formatting, encryption, data compression (SSL/TLS, JPEG)
3. **Session (Layer 5)** — Manages sessions between applications (RPC, NetBIOS)
4. **Transport (Layer 4)** — Segmenting, flow control, error recovery (**TCP**, **UDP**)
5. **Network (Layer 3)** — Path determination & Logical Addressing (**IPv4**, **IPv6**, ICMP, OSPF)
6. **Data Link (Layer 2)** — Physical Addressing (**MAC Addresses**), Switches, Frames
7. **Physical (Layer 1)** — Binary transmission, cables, fiber, wireless signals

---

## Section 2: TCP vs. UDP Protocol Comparison

| Feature | TCP (Transmission Control Protocol) | UDP (User Datagram Protocol) |
|---|---|---|
| Connection | Connection-oriented (3-way handshake) | Connectionless |
| Reliability | Guaranteed delivery & retransmission | Best-effort (No retransmission) |
| Flow Control | Sliding window algorithm | None |
| Speed | Slower due to overhead | Very fast & lightweight |
| Use Cases | Web (HTTP), Email (SMTP), File Transfer (FTP) | Video Streaming, VoIP, DNS queries |

---

## Section 3: Subnetting Cheat Sheet & Formulas

- **Class A**: \`10.0.0.0/8\` (16,777,214 hosts)
- **Class B**: \`172.16.0.0/12\` (Private range: \`172.16.0.0\` to \`172.31.255.255\`)
- **Class C**: \`192.168.0.0/16\` (Private range: \`192.168.0.0\` to \`192.168.255.255\`)

### Magic Number Method for Fast Subnetting
Subtract the last non-zero octet of the subnet mask from **256**:
- Mask \`255.255.255.192\` (/26) ➔ \`256 - 192 = 64\` (Block size is 64).
- Subnets step by 64: \`.0\`, \`.64\`, \`.128\`, \`.192\`.
- Usable hosts per subnet: \`Block Size - 2\` = \`64 - 2 = 62\` usable hosts.`,
  },
  {
    id: 'demo-routing-protocols',
    title: 'Routing Protocols Masterclass — OSPF, EIGRP & BGP Overview',
    subject: 'Routing',
    description: 'Detailed analysis of Interior Gateway Protocols (IGP) vs Exterior Gateway Protocols (EGP) with administrative distances.',
    tags: ['OSPF', 'EIGRP', 'BGP', 'Routing'],
    fileType: 'pdf',
    originalFileName: 'Routing_Protocols_DeepDive.pdf',
    authorName: 'Alex NetEng',
    authorId: 'system-demo-2',
    createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
    views: 218,
    importsCount: 54,
    wordCount: 980,
    estimatedReadTime: 5,
    content: `## Section 1: Administrative Distance (AD) Hierarchy

Administrative Distance measures the **trustworthiness** of a routing source. Lower AD is preferred.

- **Connected Interface**: \`0\`
- **Static Route**: \`1\`
- **eBGP (External BGP)**: \`20\`
- **EIGRP (Internal)**: \`90\`
- **OSPF**: \`110\`
- **IS-IS**: \`115\`
- **RIP**: \`120\`
- **iBGP (Internal BGP)**: \`200\`

---

## Section 2: OSPF (Open Shortest Path First) Key Concepts

OSPF is a **Link-State Routing Protocol** using Dijkstra's Shortest Path First (SPF) algorithm.

- **Metric**: Cost = \`Reference Bandwidth / Interface Bandwidth\` (Default Ref = 100 Mbps)
- **Multicast Addresses**: \`224.0.0.5\` (All OSPF Routers), \`224.0.0.6\` (DR/BDR Routers)
- **Area 0 (Backbone Area)**: All non-backbone areas MUST connect to Area 0 to prevent loops.
- **Router ID Election Order**:
  1. Manually configured \`router-id\`
  2. Highest active Loopback IP address
  3. Highest active Physical IP address`,
  },
  {
    id: 'demo-vlan-security',
    title: 'VLAN Security & Trunking Protocols Guide',
    subject: 'Security',
    description: 'Essential switching notes covering 802.1Q trunking, Native VLAN security risks, Port Security, and DHCP Snooping.',
    tags: ['VLAN', 'Trunking', 'Security', 'Switching'],
    fileType: 'txt',
    originalFileName: 'VLAN_Security_Notes.txt',
    authorName: 'SecOps CCNA',
    authorId: 'system-demo-3',
    createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
    views: 184,
    importsCount: 42,
    wordCount: 750,
    estimatedReadTime: 4,
    content: `## Section 1: IEEE 802.1Q Trunking & Native VLAN

- **802.1Q Tagging**: Inserts a 4-byte header into Ethernet frames, containing a 12-bit **VLAN ID (VID)** (supports 4096 VLANs).
- **Native VLAN**: Frames belonging to the Native VLAN travel untagged across trunks.
- **Security Warning**: Always change the default Native VLAN (VLAN 1) to an unused VLAN ID (e.g. VLAN 999) on both ends of a trunk to prevent **VLAN Hopping Attacks**.

---

## Section 2: Switchport Port Security Hardening

Port security restricts MAC addresses allowed on a switch port:

\`\`\`bash
Switch(config-if)# switchport mode access
Switch(config-if)# switchport port-security
Switch(config-if)# switchport port-security maximum 2
Switch(config-if)# switchport port-security mac-address sticky
Switch(config-if)# switchport port-security violation shutdown
\`\`\`

### Violation Modes:
- **Protect**: Drops unauthorized frames quietly.
- **Restrict**: Drops frames, increments security violation counter, logs SNMP trap.
- **Shutdown (Default)**: Puts port into \`err-disabled\` state immediately.`,
  },
];
