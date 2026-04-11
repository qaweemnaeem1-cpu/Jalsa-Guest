import { DriverSidebar } from '@/components/DriverSidebar';

export default function DriverVehiclesPage() {
  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <DriverSidebar />
      <main className="ml-64 flex-1 p-8">
        <h1 className="text-2xl font-bold text-[#1A1A1A] mb-2">Vehicles</h1>
        <p className="text-[#4A4A4A] text-sm">Coming soon.</p>
      </main>
    </div>
  );
}
