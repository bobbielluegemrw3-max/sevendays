import { getLang } from '@/lib/i18n-server';
import { APP_COPY } from '@/lib/i18n';
import { ContactView } from '@/components/ContactView';

export default async function ContactPage() {
  const lang = await getLang();
  return <ContactView t={APP_COPY[lang].contact} />;
}
