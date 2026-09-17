import React from 'react';
import { Wifi, Zap, Utensils, ShieldCheck } from 'lucide-react';

export function AmenityIcon({ name }) {
  if (name.includes('WiFi')) return <Wifi size={12} color="#D8993E" />;
  if (name.includes('AC')) return <Zap size={12} color="#D8993E" />;
  if (name.includes('Food')) return <Utensils size={12} color="#D8993E" />;
  return <ShieldCheck size={12} color="#D8993E" />;
}
