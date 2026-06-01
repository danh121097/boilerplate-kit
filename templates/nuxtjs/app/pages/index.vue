<script setup lang="ts">
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "reka-ui";

const { t } = useI18n();
const open = ref(false);
</script>

<template>
  <section>
    <h1 class="mb-3 text-3xl font-bold">{{ t("home.welcome") }} 👋</h1>
    <p class="mb-6 text-muted-foreground">{{ t("home.description") }}</p>

    <DialogRoot v-model:open="open">
      <DialogTrigger as-child>
        <UiButton>{{ t("home.open_dialog") }}</UiButton>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 bg-black/40" />
        <DialogContent
          class="fixed left-1/2 top-1/2 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-xl"
        >
          <DialogTitle class="text-lg font-semibold">Hello from Reka UI</DialogTitle>
          <DialogDescription class="mt-1 text-sm text-muted-foreground">
            Headless components — bring your own styles.
          </DialogDescription>
          <DialogClose as-child>
            <UiButton variant="secondary" size="sm" class="mt-4">Close</UiButton>
          </DialogClose>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <div class="mt-8 grid gap-3">
      <UiCard>
        <p class="font-semibold">Project components</p>
        <p class="mt-1 text-sm text-muted-foreground">
          <code>&lt;UiButton&gt;</code>, <code>&lt;UiCard&gt;</code>,
          <code>&lt;UiInput&gt;</code>, <code>&lt;UiVeeInput&gt;</code>,
          <code>&lt;UiBadge&gt;</code> live in <code>app/components/ui/</code>
          and auto-register globally via Nuxt's path-derived prefix.
        </p>
        <div class="mt-4 flex gap-2">
          <UiButton variant="primary">Primary</UiButton>
          <UiButton variant="secondary">Secondary</UiButton>
          <UiButton variant="outline">Outline</UiButton>
        </div>
      </UiCard>
    </div>
  </section>
</template>
