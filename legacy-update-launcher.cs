using System;
using System.Diagnostics;
using System.IO;

class LegacyUpdateLauncher {
  static void Main() {
    var folder = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
    Process.Start(new ProcessStartInfo(Path.Combine(folder, "DeskBuddy.exe")) {
      WorkingDirectory = folder,
      UseShellExecute = false
    });
  }
}
