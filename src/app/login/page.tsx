import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ListChecks className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-muted-foreground">Monitoring Task Master</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>Sign in to see the progress of all applications.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
