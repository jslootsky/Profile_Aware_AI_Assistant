import { cookies } from "next/headers";
import { getPrisma } from "./db";

export async function getCurrentUser() {
  const userId = cookies().get("demo_user_id")?.value;
  if (!userId) return null;

  const prisma = getPrisma();
  if (!prisma) return { id: userId, email: "demo@local" };

  return prisma.user.findUnique({ where: { id: userId } });
}
