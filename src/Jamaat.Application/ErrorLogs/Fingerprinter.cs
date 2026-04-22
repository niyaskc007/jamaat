using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Jamaat.Application.ErrorLogs;

/// <summary>
/// Deterministic fingerprint so that "the same error" gets grouped together
/// regardless of run-specific fields (guids, timestamps, numeric ids in paths).
/// </summary>
public static partial class Fingerprinter
{
    public static string Compute(string? exceptionType, string message, string? stackTrace)
    {
        var normalizedMessage = NormalizeMessage(message ?? string.Empty);
        var topFrames = ExtractTopFrames(stackTrace ?? string.Empty, max: 3);
        var key = $"{exceptionType ?? "?"}|{normalizedMessage}|{string.Join('>', topFrames)}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(key));
        return Convert.ToHexString(bytes)[..16];
    }

    private static string NormalizeMessage(string message)
    {
        // Strip GUIDs, hex ids, and numeric ids that vary per request
        var s = GuidRegex().Replace(message, "{guid}");
        s = HexIdRegex().Replace(s, "{hex}");
        s = NumericIdRegex().Replace(s, "{n}");
        return s.Trim();
    }

    private static IReadOnlyList<string> ExtractTopFrames(string stack, int max)
    {
        if (string.IsNullOrWhiteSpace(stack)) return [];
        var frames = new List<string>();
        foreach (var line in stack.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            // Strip "at " prefix, file paths and line numbers
            var l = FramePrefixRegex().Replace(line, "$1").Trim();
            l = FrameFileRegex().Replace(l, string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(l)) continue;
            frames.Add(l);
            if (frames.Count >= max) break;
        }
        return frames;
    }

    [GeneratedRegex(@"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")]
    private static partial Regex GuidRegex();

    [GeneratedRegex(@"\b[0-9a-fA-F]{16,}\b")]
    private static partial Regex HexIdRegex();

    [GeneratedRegex(@"(?<![\w.])\d{3,}(?![\w.])")]
    private static partial Regex NumericIdRegex();

    [GeneratedRegex(@"^(?:\s*at\s+)(.+?)(?:\s+in\s+.*)?$")]
    private static partial Regex FramePrefixRegex();

    [GeneratedRegex(@"\s*\([^()]*(?:\.cs|\.ts|\.js)[^()]*\)$")]
    private static partial Regex FrameFileRegex();
}
