import { getLang } from '@/lib/i18n-server';
import { ContactView } from '@/components/ContactView';

export default async function ContactPage() {
  const lang = await getLang();
  return <ContactView lang={lang} />;
}
