import fs from 'node:fs/promises';
import path from 'node:path';
import { ts, Project } from 'ts-morph';
import micromatch from 'micromatch';
import type { SourceFile, ExportedDeclarations } from 'ts-morph';
import type { ImportedConfiguration, Configuration } from './types';

export const resolveConfig = (importedConfiguration: ImportedConfiguration, cwdArg?: string) => {
  if (cwdArg && !('filePatterns' in importedConfiguration)) {
    const importedConfigKey = Object.keys(importedConfiguration).find(pattern => micromatch.isMatch(cwdArg, pattern));
    if (importedConfigKey) {
      return importedConfiguration[importedConfigKey];
    }
  }
  if (!cwdArg && !('filePatterns' in importedConfiguration)) {
    console.error('Unable to find `filePatterns` in configuration.');
    console.info('Add it at root level, or use the --cwd argument with a matching configuration.\n');
    return;
  }
  return importedConfiguration as Configuration;
};

const isFile = async (filePath: string) => {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
};

const findFile = async (cwd: string, fileName: string): Promise<string> => {
  const filePath = path.join(cwd, fileName);
  if (await isFile(filePath)) return filePath;
  return findFile(path.resolve(cwd, '..'), fileName);
};

export const resolvePaths = (cwd: string, patterns: string | string[]) => {
  return [patterns].flat().map(pattern => {
    if (pattern.startsWith('!')) return '!' + path.join(cwd, pattern.slice(1));
    return path.join(cwd, pattern);
  });
};

export const createProject = async (cwd: string, paths?: string | string[]) => {
  const tsConfigFilePath = await findFile(cwd, 'tsconfig.json');
  const workspace = new Project({
    tsConfigFilePath,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true
  });
  if (paths) workspace.addSourceFilesAtPaths(resolvePaths(cwd, paths));
  return workspace;
};

// Returns two arrays from items in first argument: one with the intersection, another with the rest
export const partitionSourceFiles = (projectFiles: SourceFile[], productionFiles: SourceFile[]) => {
  const productionFilePaths = productionFiles.map(file => file.getFilePath());
  const usedFiles: SourceFile[] = [];
  const unusedFiles: SourceFile[] = [];
  projectFiles.forEach(projectFile => {
    if (productionFilePaths.includes(projectFile.getFilePath())) {
      usedFiles.push(projectFile);
    } else {
      unusedFiles.push(projectFile);
    }
  });
  return [usedFiles, unusedFiles];
};

export const isType = (declaration: ExportedDeclarations) =>
  declaration.isKind(ts.SyntaxKind.TypeAliasDeclaration) ||
  declaration.isKind(ts.SyntaxKind.InterfaceDeclaration) ||
  declaration.isKind(ts.SyntaxKind.EnumDeclaration);

export const getType = (declaration: ExportedDeclarations) => {
  if (declaration.isKind(ts.SyntaxKind.TypeAliasDeclaration)) return 'type';
  if (declaration.isKind(ts.SyntaxKind.InterfaceDeclaration)) return 'interface';
  if (declaration.isKind(ts.SyntaxKind.EnumDeclaration)) return 'enum';
};