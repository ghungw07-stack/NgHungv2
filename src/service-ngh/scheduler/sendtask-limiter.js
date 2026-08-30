export async function runLimited(items, worker, concurrency = 2) {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      try {
        await worker(item);
      } catch (error) {
        console.error("Lỗi tác vụ sendtask giới hạn tải:", error);
      }
    }
  });
  await Promise.all(runners);
}
