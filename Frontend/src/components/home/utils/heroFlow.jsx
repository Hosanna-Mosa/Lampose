export const ROUTE = 'M92,84 C232,58 342,104 408,180 C452,231 372,300 268,312 C214,318 172,326 138,330';

export const STOPS = [
  {
    id: 'stay', x: 92, y: 84, side: 'right',
    title: 'Verified stay', meta: 'Room 204 · ₹4,200/mo',
    glyph: (
      <>
        <path d="M-9 1.5 L0 -7 L9 1.5" fill="none" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" />
        <path d="M-6 1 V8 H6 V1" fill="none" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: 'kitchen', x: 408, y: 180, side: 'left',
    title: 'Kitchen next door', meta: '400 m · 6 min walk',
    glyph: (
      <>
        <path d="M-8 -6 a8 8 0 0 0 16 0" fill="none" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M-10 -6 H10" fill="none" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M0 -6 V8" fill="none" strokeWidth="2.2" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: 'door', x: 138, y: 330, side: 'right',
    title: 'At your door', meta: 'Delivered in 18 min',
    glyph: (
      <>
        <rect x="-7" y="-8" width="14" height="16" rx="2" fill="none" strokeWidth="2.2" />
        <circle cx="3.5" cy="0" r="1.4" />
      </>
    ),
  },
];

export const CHIP_W = 176;

export const CHIP_H = 52;
