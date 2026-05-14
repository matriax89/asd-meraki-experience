import Script from "next/script";

export function InstagramWidget({ beholdUrl, profileUrl }: { beholdUrl?: string, profileUrl?: string }) {
  return (
    <div className="w-full relative pb-6 md:pb-12 min-h-[400px]">
      {/* Elfsight Instagram Feed */}
      <div className="elfsight-app-8f79b975-b8cc-4009-99dc-a6ae1ae0fc63" data-elfsight-app-lazy></div>
      <Script src="https://elfsightcdn.com/platform.js" strategy="lazyOnload" />
    </div>
  );
}
