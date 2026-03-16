import VendorPortal from './VendorPortal';

export default function VendorPortalPage({ params }: { params: { token: string } }) {
  return <VendorPortal token={params.token} />;
}
