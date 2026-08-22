import { DistributionPackage } from "@/core/distribution-schemas";
import { Project } from "@/core/project-schemas";

export interface DistributionProvider {
  name: string;
  generateDistributionPackage(project: Project): Promise<DistributionPackage>;
}