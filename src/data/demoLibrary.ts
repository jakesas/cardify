import { LibraryResourceMeta } from '../lib/library';

export const DEMO_LIBRARY_RESOURCES: (LibraryResourceMeta & { content: string })[] = [
  {
    id: 'demo-purposive-comm',
    title: 'Purposive Communication — 9 Cs & Core Principles',
    subject: 'Communication',
    description: 'Essential guide covering Michael Osborn\'s 9 Cs of Communication, Components, Barriers, and Models.',
    tags: ['Communication', '9 Cs', 'Ethics', 'Barriers'],
    fileType: 'docx',
    originalFileName: 'Purposive_Communication_Notes.docx',
    authorName: 'Prof. A. Santos',
    authorId: 'system-demo-1',
    createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
    views: 412,
    importsCount: 124,
    wordCount: 850,
    estimatedReadTime: 4,
    content: `## Section 1: The 9 Cs of Communication (Michael Osborn)

- **Clarity** – Easy to understand and free of ambiguity.
- **Conciseness** – Expressing ideas briefly and directly without fluff.
- **Concreteness** – Using specific, definite, and vivid details.
- **Correctness** – Being accurate and free from grammatical or factual errors.
- **Courtesy** – Showing politeness, respect, and positive tone.
- **Creativity** – Using original and imaginative ideas to engage the listener.
- **Cultural Sensitivity** – Respecting different cultures, traditions, and beliefs.
- **Captivating** – Interesting and able to hold audience attention.
- **Consideration** – Being thoughtful of others' feelings, background, and needs.

---

## Section 2: Components & Barriers of Communication

### Core Components
- **Source**: The sender who initiates the message.
- **Message**: The core idea or information being transmitted.
- **Channel**: The medium (speech, text, video) used to convey the message.
- **Receiver**: The target recipient who decodes the message.
- **Feedback**: The response sent back by the receiver.

### Types of Communication Barriers
- **Psychological**: Mental/emotional states (stress, bias, anxiety).
- **Physical**: Environmental noise, distance, or physical discomfort.
- **Linguistic/Cultural**: Language differences, jargon, or cultural misunderstandings.
- **Mechanical**: Technical faults in phones, computers, or network gear.`,
  },
  {
    id: 'demo-css-hardware',
    title: 'Computer System Servicing — Hardware & Port Reference',
    subject: 'IT & Systems',
    description: 'Complete breakdown of motherboard components, power connectors, BIOS, and Back I/O port color codes.',
    tags: ['CSS', 'Hardware', 'Motherboard', 'Ports'],
    fileType: 'pdf',
    originalFileName: 'CSS_Hardware_Guide.pdf',
    authorName: 'TechCert Academy',
    authorId: 'system-demo-2',
    createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
    views: 318,
    importsCount: 78,
    wordCount: 1100,
    estimatedReadTime: 5,
    content: `## Section 1: Motherboard Component Functions

- **CPU Socket** – Holds the processor (CPU) and connects it to motherboard trace lines.
- **ATX 24-Pin Connector** – Supplies primary power to the motherboard.
- **ATX 4/8-Pin CPU Power** – Delivers dedicated 12V power directly to the CPU.
- **ROM BIOS** – Contains startup instructions needed to perform POST and boot.
- **CMOS Battery** – Retains BIOS settings and system clock time when powered off.
- **PCIe x16 Slot** – Connects dedicated high-performance graphics cards.
- **Northbridge (MCH)** – Manages fast communication between CPU, RAM, and GPU.
- **Southbridge (ICH)** – Handles USB, audio, storage drives, and expansion buses.

---

## Section 2: Back I/O Panel Port Standard

| Port Name | Connector Color | Purpose |
|---|---|---|
| PS/2 Mouse | Green | Legacy pointing devices |
| PS/2 Keyboard | Purple | Legacy keyboards |
| Parallel Port | DB-25 Purple | Printers |
| Line In | Light Blue | Tape/CD/External audio |
| Line Out | Lime Green | Speakers / Headphones |
| Microphone | Pink | Audio recording |
| LAN (RJ-45) | Metal / Black | Ethernet Network Connection |
| VGA Port | Blue 15-pin | Analog display output |`,
  },
  {
    id: 'demo-cs-fundamentals',
    title: 'Computer Science — Data Structures & Algorithm Complexity',
    subject: 'Computer Science',
    description: 'Comprehensive study notes on Big-O notation, Arrays, Linked Lists, Trees, and Sorting Algorithms.',
    tags: ['Computer Science', 'Algorithms', 'Big-O', 'Data Structures'],
    fileType: 'txt',
    originalFileName: 'DS_Algo_Notes.txt',
    authorName: 'CS Department',
    authorId: 'system-demo-3',
    createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
    views: 295,
    importsCount: 62,
    wordCount: 920,
    estimatedReadTime: 5,
    content: `## Section 1: Big-O Time Complexity Guide

Big-O notation describes the **upper bound execution time** of an algorithm as input size \`N\` grows:

- **O(1)** – Constant Time (e.g., Array index access)
- **O(log N)** – Logarithmic Time (e.g., Binary Search)
- **O(N)** – Linear Time (e.g., Unsorted Array Search)
- **O(N log N)** – Linearithmic Time (e.g., Merge Sort, Quick Sort)
- **O(N²)** – Quadratic Time (e.g., Bubble Sort, Insertion Sort)

---

## Section 2: Essential Data Structures Comparison

| Data Structure | Access Time | Search Time | Insertion | Deletion |
|---|---|---|---|---|
| **Array** | O(1) | O(N) | O(N) | O(N) |
| **Linked List** | O(N) | O(N) | O(1) | O(1) |
| **Hash Table** | O(1) | O(1) | O(1) | O(1) |
| **Binary Search Tree** | O(log N) | O(log N) | O(log N) | O(log N) |`,
  },
];
