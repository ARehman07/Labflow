import { redirect } from 'next/navigation';

// Root simply routes into the app; middleware handles auth.
export default function Home() {
  redirect('/dashboard');
}
