// Persuasion angles a hook can use, for the edge functions. The same list lives
// in src/lib/angles.js for the app; a test keeps the two identical, so change
// both together.
export const ANGLES = [
  { id: 'pain', label: 'Pain point', hint: 'names a problem the viewer has' },
  { id: 'curiosity', label: 'Curiosity', hint: 'opens a question the viewer wants answered' },
  { id: 'social_proof', label: 'Social proof', hint: 'reviews, customer counts, testimonials' },
  { id: 'offer', label: 'Offer', hint: 'discount, bundle, free trial, guarantee' },
  { id: 'authority', label: 'Authority', hint: 'expert, research, press, credentials' },
  { id: 'story', label: 'Story', hint: 'founder or customer narrative' },
  { id: 'comparison', label: 'Comparison', hint: 'us versus them, before and after' },
  { id: 'urgency', label: 'Urgency', hint: 'deadline, scarcity, limited drop' },
  { id: 'identity', label: 'Identity', hint: 'speaks to who the viewer is or wants to be' },
  { id: 'how_to', label: 'How to', hint: 'teaches something useful' },
  { id: 'other', label: 'Other', hint: 'none of the above' },
];
export const ANGLE_IDS = ANGLES.map((a) => a.id);
export const angleLabel = (id) => ANGLES.find((a) => a.id === id)?.label || null;
