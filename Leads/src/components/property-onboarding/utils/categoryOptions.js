import { BedDouble, Building2, Users } from 'lucide-react';

export const CATEGORY_OPTIONS = [
  {
    id: 'PG',
    title: 'Paying Guest (PG)',
    subtitle: 'Food included, sharing rooms, student/worker stays',
    badge: 'Popular',
    icon: Building2
  },
  {
    id: 'Hostel',
    title: 'Student/Work Hostel',
    subtitle: 'Boys/Girls hostel with canteen, warden & security',
    badge: 'Secure',
    icon: Building2
  },
  {
    id: 'Dormitory',
    title: 'Dormitory / Pods',
    subtitle: 'Bunk beds, daily rates, personal lockers & shared bath',
    badge: 'Budget',
    icon: BedDouble
  },
  {
    id: 'Bachelor Room',
    title: 'Bachelor Room / Flat',
    subtitle: '1BHK/2BHK flat or room for male/female bachelors',
    badge: 'Private',
    icon: Users
  }
];
