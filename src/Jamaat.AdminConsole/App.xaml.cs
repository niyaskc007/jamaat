using System.Windows;

namespace Jamaat.AdminConsole;

public partial class App : Application
{
    // Defined here to keep MainWindow.xaml's x:Class reference happy. All boot logic
    // lives in MainWindow's Loaded handler so the window itself is the entry point.
}
