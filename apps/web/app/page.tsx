import { redirect } from 'next/navigation';

export default function RootPage(): React.JSX.Element {
  redirect('/dashboard');
}
