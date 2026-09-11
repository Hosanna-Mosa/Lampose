import { Calendar, Clock, Heart, MapPin, ShieldCheck, Sparkles } from 'lucide-react';

export const SLIDES = [
  {
    id: 1,
    tag: "INDIA'S ALL-IN-ONE URBAN LIVING PLATFORM",
    title: "More Choices. ",
    titleHighlight: "Better Experiences.",
    subtitle: "Top hostels, verified PGs & bachelor flats — ",
    subtitleHighlight: "all in one place.",
    buttonText: "Onboard Property",
    image: "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80",
    imageBadge: "100% Verified PGs",
    features: [
      { icon: MapPin, title: "Top Locations", sub: "Near You", color: "#D8993E", bg: "rgba(216, 153, 62, 0.12)" },
      { icon: ShieldCheck, title: "Verified Partners", sub: "You Can Trust", color: "#2A593E", bg: "rgba(42, 89, 62, 0.12)" },
      { icon: Heart, title: "Great Reviews", sub: "Happy Customers", color: "#D8993E", bg: "rgba(216, 153, 62, 0.12)" }
    ]
  },
  {
    id: 2,
    tag: "FLEXIBLE DURATION OPTIONS",
    title: "Short Stay or Long Stay? ",
    titleHighlight: "We Have Both.",
    subtitle: "List daily stays (1-7 days) or monthly accommodation — ",
    subtitleHighlight: "direct to tenants.",
    buttonText: "Onboard Short / Long Stay",
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
    imageBadge: "Daily & Monthly Rates",
    features: [
      { icon: Clock, title: "1 - 7 Days", sub: "Short Stay Rate", color: "#D8993E", bg: "rgba(216, 153, 62, 0.12)" },
      { icon: Calendar, title: "1 Month+", sub: "Monthly Rent", color: "#2A593E", bg: "rgba(42, 89, 62, 0.12)" },
      { icon: Sparkles, title: "0% Brokerage", sub: "Direct Enquiries", color: "#D8993E", bg: "rgba(216, 153, 62, 0.12)" }
    ]
  },
  {
    id: 3,
    tag: "GROW YOUR ACCOMMODATION BUSINESS",
    title: "Onboard Your Property ",
    titleHighlight: "In 2 Minutes.",
    subtitle: "Join thousands of PG, Hostel, Dormitory & Bachelor Flat owners — ",
    subtitleHighlight: "fill details & go live instantly.",
    buttonText: "Start Onboarding Now",
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
    imageBadge: "Instant Listing",
    features: [
      { icon: ShieldCheck, title: "Verified Owners", sub: "Trusted Platform", color: "#2A593E", bg: "rgba(42, 89, 62, 0.12)" },
      { icon: Sparkles, title: "Fast Onboarding", sub: "Live in Minutes", color: "#D8993E", bg: "rgba(216, 153, 62, 0.12)" },
      { icon: MapPin, title: "PAN India", sub: "Major Cities", color: "#2A593E", bg: "rgba(42, 89, 62, 0.12)" }
    ]
  }
];
