import { currentUser } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const user = await currentUser();
  const name = user?.firstName ?? user?.username ?? "there";

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Welcome, {name}</h1>
      <p className="text-gray-600">Auth works end to end.</p>
    </div>
  );
}
