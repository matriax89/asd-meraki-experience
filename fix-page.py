import re

with open("src/app/[locale]/(public)/page.tsx", "r") as f:
    content = f.read()

# Edit 1: import ScheduleClient
content = content.replace(
    'import { YoutubeCarousel } from "@/components/public/youtube-carousel";',
    'import { YoutubeCarousel } from "@/components/public/youtube-carousel";\nimport { ScheduleClient } from "./orario/schedule-client";'
)

# Edit 2: add locations
content = content.replace(
    '  const documenti = content.documenti || {};\n\n  return (',
    '  const documenti = content.documenti || {};\n  const locations = content.locations || ["Bolzano", "Appiano", "Altro"];\n\n  return ('
)

# Edit 3: replace the mock schedule
start_idx = content.find('          <FadeIn delay={0.2}>\n            <div className="bg-background rounded-[2rem] border')
end_idx = content.find('          </FadeIn>\n\n          <FadeIn delay={0.4} className="mt-12 text-center">')

if start_idx != -1 and end_idx != -1:
    new_schedule = """          <FadeIn delay={0.2}>
            <ScheduleClient 
              slotsByDay={slotsByDay} 
              fasce={fasce} 
              giorniSettimana={giorni.map(g => ({ ...g, short: g.label.substring(0, 3).toUpperCase() }))} 
              locations={locations} 
            />
            <div className="mt-8 text-center">
              <Link href="/orario" className="text-[14px] font-semibold text-foreground hover:underline">
                {t("schedule.view_full")}
              </Link>
            </div>"""
    content = content[:start_idx] + new_schedule + content[end_idx:]

with open("src/app/[locale]/(public)/page.tsx", "w") as f:
    f.write(content)

print("Done")
