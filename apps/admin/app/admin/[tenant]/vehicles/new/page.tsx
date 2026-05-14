import VehicleForm from "../VehicleForm";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function NewVehiclePage({ params }: PageProps) {
  const { tenant } = await params;
  return <VehicleForm tenantSlug={tenant} />;
}
