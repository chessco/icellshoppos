export type ManualFeature = {
  title: string;
  description: string;
  routes?: string[];
};

export type ManualSection = {
  id: string;
  title: string;
  summary: string;
  features: ManualFeature[];
  connections: string[];
};

export type ManualContent = {
  title: string;
  subtitle: string;
  updatedAt: string;
  sections: ManualSection[];
};
