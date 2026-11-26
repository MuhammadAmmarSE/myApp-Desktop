// After packing for Windows: give Redline.exe its icon and its name, version and description
// (what Explorer and the task manager show). electron-builder does this with rcedit, which needs
// Wine off Windows; resedit does it in plain JavaScript on any computer.
const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const { NtExecutable, NtExecutableResource, Data, Resource } = await import("resedit");
  const name = context.packager.appInfo.productFilename;
  const version = context.packager.appInfo.version;
  const exePath = path.join(context.appOutDir, `${name}.exe`);
  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = NtExecutableResource.from(exe);

  const icon = Data.IconFile.from(fs.readFileSync(path.join(context.packager.projectDir, "build/icon.ico")));
  const groups = Resource.IconGroupEntry.fromEntries(res.entries);
  const id = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, icon.icons.map((i) => i.data));

  const vi = Resource.VersionInfo.fromEntries(res.entries)[0] || Resource.VersionInfo.createEmpty();
  const [a, b, c] = version.split(".").map((n) => parseInt(n, 10) || 0);
  vi.setFileVersion(a, b, c, 0, 1033);
  vi.setProductVersion(a, b, c, 0, 1033);
  vi.setStringValues(
    { lang: 1033, codepage: 1200 },
    { ProductName: "Redline", FileDescription: "Redline", CompanyName: "Redline", LegalCopyright: "Redline", OriginalFilename: `${name}.exe`, InternalName: name, ProductVersion: version, FileVersion: version }
  );
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`  • set the icon and details of ${name}.exe`);
};
