declare global {
  var prisma: any;
}

export function getPrisma(): any {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!global.prisma) {
    // Lazy import so app still compiles when Prisma Client hasn't been generated yet.
    const { PrismaClient } = require("@prisma/client");
    global.prisma = new PrismaClient();
  }

  return global.prisma;
}
