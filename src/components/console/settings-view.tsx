"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Monitor } from "lucide-react";

import { ApiKeyPanel } from "@/components/console/api-key-panel";
import { SettingsCard, SettingsRow } from "@/components/console/settings-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { currentUser, workspace } from "@/data/workspace";
import {
  notificationDefaults,
  notificationSchema,
  profileDefaults,
  profileSchema,
  timezones,
  workspaceDefaults,
  workspaceSchema,
  type NotificationSettings,
  type ProfileSettings,
  type WorkspaceSettings,
} from "@/lib/validations/settings";
import { cn } from "@/lib/utils";

const tabs = [
  { value: "profile", label: "Profile" },
  { value: "workspace", label: "Workspace" },
  { value: "appearance", label: "Appearance" },
  { value: "notifications", label: "Notifications" },
  { value: "api-keys", label: "API Keys" },
] as const;

/** Shared footer: validation hint on the left, submit on the right. */
function FormFooter({
  disabled,
  hint,
}: {
  disabled: boolean;
  hint: string;
}) {
  return (
    <>
      <p className="text-xs font-medium text-muted">{hint}</p>
      <Button type="submit" size="sm" disabled={disabled}>
        Save changes
      </Button>
    </>
  );
}

function ProfileSection() {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileSettings>({
    resolver: zodResolver(profileSchema),
    defaultValues: profileDefaults,
    mode: "onBlur",
  });

  const onSubmit = handleSubmit((values) => {
    reset(values);
    toast({
      title: "Profile validated",
      description: "Nothing was saved — accounts arrive with the backend.",
      tone: "info",
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <SettingsCard
        title="Profile"
        description="How you appear across the workspace and on generated reports."
        footer={<FormFooter disabled={!isDirty} hint="Validation runs locally." />}
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Avatar initials={currentUser.initials} size="lg" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{currentUser.name}</p>
              <p className="mt-0.5 text-xs font-medium text-muted">{currentUser.role}</p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Display name"
              htmlFor="displayName"
              error={errors.displayName?.message}
            >
              <Input
                id="displayName"
                aria-invalid={Boolean(errors.displayName)}
                {...register("displayName")}
              />
            </Field>

            <Field label="Handle" htmlFor="handle" error={errors.handle?.message}>
              <Input
                id="handle"
                aria-invalid={Boolean(errors.handle)}
                {...register("handle")}
              />
            </Field>

            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
            </Field>

            <Field label="Timezone" htmlFor="timezone" error={errors.timezone?.message}>
              <Select id="timezone" {...register("timezone")}>
                {timezones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </SettingsCard>
    </form>
  );
}

function WorkspaceSection() {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<WorkspaceSettings>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: workspaceDefaults,
    mode: "onBlur",
  });

  const onSubmit = handleSubmit((values) => {
    reset(values);
    toast({
      title: "Workspace validated",
      description: "Workspace preferences are not stored yet — only the API key is.",
      tone: "info",
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <SettingsCard
        title="Workspace"
        description="Identity and execution limits for this workspace."
        footer={<FormFooter disabled={!isDirty} hint="Validation runs locally." />}
      >
        <div className="flex flex-col gap-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Workspace name"
              htmlFor="workspaceName"
              error={errors.workspaceName?.message}
            >
              <Input
                id="workspaceName"
                aria-invalid={Boolean(errors.workspaceName)}
                {...register("workspaceName")}
              />
            </Field>

            <Field label="Slug" htmlFor="slug" error={errors.slug?.message}>
              <Input
                id="slug"
                aria-invalid={Boolean(errors.slug)}
                {...register("slug")}
              />
            </Field>

            <Field
              label="Network"
              htmlFor="network"
              hint="Molthood targets a single network."
            >
              <Input id="network" value={workspace.network} readOnly disabled />
            </Field>

            <Field
              label="Max concurrent executions"
              htmlFor="maxConcurrency"
              error={errors.maxConcurrency?.message}
            >
              <Select id="maxConcurrency" {...register("maxConcurrency")}>
                {[1, 2, 3, 5, 8, 10].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <SettingsRow
            htmlFor="requireApproval"
            label="Require approval before execution"
            description="Runs pause after planning and wait for a human to confirm before any on-chain step is taken."
            control={<Switch id="requireApproval" {...register("requireApproval")} />}
          />
        </div>
      </SettingsCard>
    </form>
  );
}

const themes = [
  { id: "lime", label: "Lime", description: "The default field.", swatch: "bg-background" },
  { id: "ink", label: "Ink", description: "Inverted, black field.", swatch: "bg-primary" },
  {
    id: "system",
    label: "System",
    description: "Follow the operating system.",
    swatch: "bg-surface-raised",
  },
] as const;

function AppearanceSection() {
  const { toast } = useToast();
  const [theme, setTheme] = React.useState<string>("lime");
  const [density, setDensity] = React.useState("comfortable");

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard
        title="Theme"
        description="Molthood ships a single lime theme today. Alternates are shown here as UI only."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {themes.map((item) => {
            const selected = theme === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTheme(item.id);
                  if (item.id !== "lime") {
                    toast({
                      title: `${item.label} theme is not available yet`,
                      description: "Only the lime field is implemented in this phase.",
                      tone: "info",
                    });
                  }
                }}
                aria-pressed={selected}
                className={cn(
                  "flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors",
                  selected
                    ? "border-primary bg-surface-raised"
                    : "border-border bg-surface hover:border-border-strong",
                )}
              >
                <span
                  className={cn(
                    "h-12 w-full rounded-md border border-border-strong",
                    item.swatch,
                  )}
                  aria-hidden="true"
                />
                <span>
                  <span className="block text-sm font-bold text-foreground">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium text-muted">
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard title="Layout" description="Spacing and motion preferences.">
        <SettingsRow
          htmlFor="density"
          label="Density"
          description="Controls the vertical rhythm of tables and lists."
          control={
            <Select
              id="density"
              value={density}
              onChange={(event) => setDensity(event.target.value)}
              className="w-40"
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </Select>
          }
        />
        <SettingsRow
          htmlFor="reduceMotion"
          label="Reduce motion"
          description="The console already honours your system reduced-motion setting."
          control={<Switch id="reduceMotion" defaultChecked={false} />}
        />
      </SettingsCard>
    </div>
  );
}

const notificationRows: {
  key: keyof NotificationSettings;
  label: string;
  description: string;
}[] = [
  {
    key: "executionCompleted",
    label: "Execution completed",
    description: "Sent whenever a run reaches its final stage successfully.",
  },
  {
    key: "executionFailed",
    label: "Execution failed",
    description: "Sent when a run stops before settling, with the failing stage.",
  },
  {
    key: "reportGenerated",
    label: "Report generated",
    description: "Sent once a completed run compiles its report.",
  },
  {
    key: "agentStateChanged",
    label: "Agent state changed",
    description: "Sent when an agent is paused, resumed, or enters an error state.",
  },
  {
    key: "weeklyDigest",
    label: "Weekly digest",
    description: "A Monday summary of executions, success rate, and open projects.",
  },
];

function NotificationsSection() {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<NotificationSettings>({
    resolver: zodResolver(notificationSchema),
    defaultValues: notificationDefaults,
  });

  const onSubmit = handleSubmit((values) => {
    reset(values);
    toast({
      title: "Notification preferences validated",
      description: "Delivery starts once webhooks and email are connected.",
      tone: "info",
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <SettingsCard
        title="Notifications"
        description="Choose which events reach you once delivery is connected."
        footer={<FormFooter disabled={!isDirty} hint="Nothing is delivered yet." />}
      >
        {notificationRows.map((row) => (
          <SettingsRow
            key={row.key}
            htmlFor={row.key}
            label={row.label}
            description={row.description}
            control={<Switch id={row.key} {...register(row.key)} />}
          />
        ))}
      </SettingsCard>
    </form>
  );
}

function ApiKeysSection() {
  // The panel is the real thing rather than a settings-shaped copy of it, so
  // the key shown here and the one the executions page asks for can never
  // drift apart.
  return <ApiKeyPanel className="border-0 bg-transparent p-0 sm:p-0" />;
}

function SettingsView() {
  return (
    <Tabs defaultValue="profile">
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
            {tab.value === "api-keys" ? (
              <Monitor className="ml-1.5 hidden size-3 opacity-0" aria-hidden="true" />
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="profile" className="max-w-3xl">
        <ProfileSection />
      </TabsContent>
      <TabsContent value="workspace" className="max-w-3xl">
        <WorkspaceSection />
      </TabsContent>
      <TabsContent value="appearance" className="max-w-3xl">
        <AppearanceSection />
      </TabsContent>
      <TabsContent value="notifications" className="max-w-3xl">
        <NotificationsSection />
      </TabsContent>
      <TabsContent value="api-keys" className="max-w-3xl">
        <ApiKeysSection />
      </TabsContent>
    </Tabs>
  );
}

export { SettingsView };
