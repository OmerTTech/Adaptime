import { test, expect } from "@playwright/test";
import { seedLogin, setupFakeApi } from "./fakeApi";

/**
 * Duman testi: giriş (token ile), görev ekleme, başlatma, duraklatma akışı ve
 * tamamlama. Backend taklit edilir; test gerçek veritabanına dokunmaz.
 */
test("giriş, görev ekle, başlat/duraklat, bitir", async ({ page }) => {
  const api = await setupFakeApi(page);
  await seedLogin(page);

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Bugünün planı" }),
  ).toBeVisible();

  // Görev ekle (planlı): saat gelecekte olmalı, aksi halde saatsiz kalır.
  const start = new Date(Date.now() + 45 * 60_000);
  const hhmm = `${String(start.getHours()).padStart(2, "0")}:${String(
    start.getMinutes(),
  ).padStart(2, "0")}`;

  await page.getByRole("button", { name: "Görev ekle" }).click();
  await page.getByRole("button", { name: /Manuel Ekle/ }).click();
  await page.getByPlaceholder("Örn: Kodlama Çalışması").fill("Kitap oku");
  await page.getByRole("button", { name: "Planlı" }).click();
  await page.locator('input[type="time"]').first().fill(hhmm);
  await page.getByRole("button", { name: "Ekle", exact: true }).click();

  const title = page.getByText("Kitap oku", { exact: true }).first();
  await expect(title).toBeVisible();

  // Başlat
  await page.getByTitle("Başlat").first().click();
  await expect(page.getByText("● Canlı")).toBeVisible();

  // Duraklat
  await page.getByTitle("Duraklat").first().click();
  await expect(page.getByText("● Duraklatıldı")).toBeVisible();

  // Bitir: görev kartındaki "Tamamla" (odak kartında da aynı başlık var).
  const card = page
    .locator("div.group")
    .filter({ has: page.getByRole("heading", { name: "Kitap oku" }) });
  // Kart içinde iki "Tamamla" var: soldaki yuvarlak (yalnızca bekleyen görevde
  // çalışır) ve sağdaki eylem düğmesi. Duraklatılmış görevi eylem düğmesi bitirir.
  await card.getByTitle("Tamamla").nth(1).click();
  await expect
    .poll(
      () =>
        api.saves.some((save) =>
          save.tasks?.some(
            (task) => task.title === "Kitap oku" && task.status === "completed",
          ),
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
});
