import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currencyCode = 'USD', options = {}) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options
  });

  return formatter.format(amount);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function formatTimeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return `${diffInSeconds} second${diffInSeconds !== 1 ? 's' : ''} ago`;
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays} day${diffInDays !== 1 ? 's' : ''} ago`;
  }
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths !== 1 ? 's' : ''} ago`;
  }
  
  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears} year${diffInYears !== 1 ? 's' : ''} ago`;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function getServiceIcon(serviceType: string): React.ReactNode {
  // Return the first letter of the service type as a placeholder
  // In a real implementation, this would use proper icons from a library like react-icons
  const iconMap: Record<string, string> = {
    'mercury_bank': 'M',
    'wavapps': 'W',
    'doorloop': 'D',
    'stripe': 'S',
    'quickbooks': 'Q',
    'xero': 'X',
    'brex': 'B',
    'gusto': 'G',
    'github': 'G',
  };
  
  return iconMap[serviceType] || serviceType.charAt(0).toUpperCase();
}

export function getServiceColor(serviceType: string): string {
  // Color mapping for Chitty Services integrations
  const colorMap: Record<string, string> = {
    'mercury_bank': 'bg-blue-500',
    'wavapps': 'bg-teal-500',
    'doorloop': 'bg-orange-500',
    'stripe': 'bg-purple-500',
    'quickbooks': 'bg-green-500',
    'xero': 'bg-blue-400',
    'brex': 'bg-indigo-500',
    'gusto': 'bg-pink-500',
    'github': 'bg-gray-800',
  };

  return colorMap[serviceType] || 'bg-gray-500';
}

export function getPriorityClass(priority: string | undefined): string {
  switch (priority) {
    case 'urgent':
      return 'bg-error/10 text-error';
    case 'due_soon':
      return 'bg-warning/10 text-warning';
    case 'upcoming':
      return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
    default:
      return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
  }
}

export function getLabelForPriority(priority: string | undefined): string {
  switch (priority) {
    case 'urgent':
      return 'Urgent';
    case 'due_soon':
      return 'Due Soon';
    case 'upcoming':
      return 'Upcoming';
    default:
      return 'Normal';
  }
}
