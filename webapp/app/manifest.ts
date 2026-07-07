import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ふりかえり Web",
    short_name: "ふりかえり",
    description: "授業開始から返却までを配布しやすい Web/PWA で運用する。",
    start_url: "/",
    display: "standalone",
    background_color: "#f4efe6",
    theme_color: "#1d6f8d",
    lang: "ja",
    icons: []
  };
}
