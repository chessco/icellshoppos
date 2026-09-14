import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/register", "/login", "/public-inventory"],
        disallow: [
          "/dashboard",
          "/admin",
          "/api/",
          "/sales",
          "/inventory",
          "/billing",
          "/profile",
          "/data",
          "/purchase-orders",
          "/add-device",
          "/label-designer",
          "/credit",
          "/imeicheck2",
          "/my-orders",
          "/device-guide",
        ],
      },
    ],
    sitemap: "https://probuyer.org/sitemap.xml",
  };
}
