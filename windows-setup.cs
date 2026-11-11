using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

class DeskBuddySetup {
  const string Version = "0.1.40";

  [STAThread]
  static void Main() {
    try {
      string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "DeskBuddy", "v" + Version);
      string exe = Path.Combine(folder, "DeskBuddy.exe");
      foreach (Process process in Process.GetProcessesByName("DeskBuddy")) {
        try { process.Kill(); process.WaitForExit(10000); } catch (Exception) { /* Another user's process may be protected. */ }
      }
      Directory.CreateDirectory(folder);
      using (Stream source = Assembly.GetExecutingAssembly().GetManifestResourceStream("DeskBuddy.zip"))
      using (var archive = new ZipArchive(source, ZipArchiveMode.Read)) {
        foreach (ZipArchiveEntry entry in archive.Entries) {
          string destination = Path.GetFullPath(Path.Combine(folder, entry.FullName.Replace('/', Path.DirectorySeparatorChar)));
          if (!destination.StartsWith(folder + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new Exception("설치 파일 경로가 잘못되었어요.");
          if (entry.Name.Length == 0) { Directory.CreateDirectory(destination); continue; }
          Directory.CreateDirectory(Path.GetDirectoryName(destination));
          using (Stream input = entry.Open())
          using (FileStream output = File.Create(destination)) input.CopyTo(output);
        }
      }
      if (!File.Exists(exe)) throw new Exception("DeskBuddy.exe를 찾을 수 없어요.");
      string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
      dynamic shortcut = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
      dynamic link = shortcut.CreateShortcut(Path.Combine(desktop, "DeskBuddy.lnk"));
      link.TargetPath = exe;
      link.WorkingDirectory = folder;
      link.Description = "DeskBuddy";
      link.Save();
      Process.Start(new ProcessStartInfo(exe, "--enable-auto-start") { WorkingDirectory = folder, UseShellExecute = false });
      MessageBox.Show("DeskBuddy v" + Version + " 설치가 끝났어요. 바탕화면 바로가기와 자동 시작도 설정했어요.", "DeskBuddy", MessageBoxButtons.OK, MessageBoxIcon.Information);
    } catch (Exception error) {
      MessageBox.Show("설치를 완료하지 못했어요.\n" + error.Message, "DeskBuddy", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
  }
}
