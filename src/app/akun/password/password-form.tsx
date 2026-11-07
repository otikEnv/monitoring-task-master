"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, undefined);

  return (
    <Card className="max-w-md">
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Repeat new password</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>

          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state?.success && (
            <p role="status" className="text-sm text-green-700 dark:text-green-400">
              {state.success}
            </p>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
