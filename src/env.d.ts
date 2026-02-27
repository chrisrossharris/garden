/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    auth?: () => { userId?: string | null };
  }
}
