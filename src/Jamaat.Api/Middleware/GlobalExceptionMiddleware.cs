using System.Text.Json;
using FluentValidation;
using Jamaat.Application.ErrorLogs;
using Jamaat.Domain.Enums;
using Jamaat.Domain.Exceptions;
using Jamaat.Infrastructure.Common;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Middleware;

/// Converts unhandled exceptions to RFC 7807 ProblemDetails responses with
/// the correlation ID as traceId. Persists an ErrorLog row for anything worse
/// than a 4xx-from-expected domain exception. Logs at appropriate level.
public sealed class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;
    private readonly IHostEnvironment _env;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger, IHostEnvironment env)
    {
        _next = next;
        _logger = logger;
        _env = env;
    }

    public async Task InvokeAsync(HttpContext context, ICorrelationContext correlation, IErrorLogService errorLogs)
    {
        try
        {
            await _next(context);
        }
        catch (ValidationException vex)
        {
            await WriteProblem(context, correlation, StatusCodes.Status400BadRequest, "Validation failed",
                "One or more validation errors occurred.", vex.Errors.Select(e => new { e.PropertyName, e.ErrorMessage }));
            _logger.LogWarning(vex, "Validation error");
            await Record(errorLogs, vex, context, correlation, ErrorSeverity.Warning, 400);
        }
        catch (DomainNotFoundException nf)
        {
            await WriteProblem(context, correlation, StatusCodes.Status404NotFound, nf.Code, nf.Message, null);
            _logger.LogInformation("Not found: {Code} {Message}", nf.Code, nf.Message);
        }
        catch (BusinessRuleException br)
        {
            await WriteProblem(context, correlation, StatusCodes.Status422UnprocessableEntity, br.Code, br.Message, null);
            _logger.LogWarning("Business rule violation: {Code} {Message}", br.Code, br.Message);
            await Record(errorLogs, br, context, correlation, ErrorSeverity.Warning, 422);
        }
        catch (UnauthorizedAccessException ua)
        {
            await WriteProblem(context, correlation, StatusCodes.Status401Unauthorized, "unauthorized", ua.Message, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception. TraceId={TraceId}", correlation.CorrelationId);
            var detail = _env.IsDevelopment() ? ex.ToString() : "An unexpected error occurred. Please contact support with the traceId.";
            await WriteProblem(context, correlation, StatusCodes.Status500InternalServerError, "internal_error", detail, null);
            await Record(errorLogs, ex, context, correlation, ErrorSeverity.Error, 500);
        }
    }

    private static async Task Record(
        IErrorLogService errorLogs,
        Exception ex,
        HttpContext ctx,
        ICorrelationContext correlation,
        ErrorSeverity severity,
        int httpStatus)
    {
        try
        {
            await errorLogs.RecordAsync(new RecordErrorRequest(
                Source: ErrorSource.Api,
                Severity: severity,
                Message: ex.Message,
                ExceptionType: ex.GetType().FullName,
                StackTrace: ex.StackTrace,
                Endpoint: ctx.Request.Path.Value,
                HttpMethod: ctx.Request.Method,
                HttpStatus: httpStatus,
                CorrelationId: correlation.CorrelationId,
                UserAgent: correlation.UserAgent,
                IpAddress: correlation.IpAddress));
        }
        catch
        {
            // Swallow - an error while recording errors should never surface to the caller.
        }
    }

    private static async Task WriteProblem(
        HttpContext ctx,
        ICorrelationContext correlation,
        int status,
        string title,
        string detail,
        object? extensions)
    {
        if (ctx.Response.HasStarted) return;
        ctx.Response.Clear();
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "application/problem+json";

        var problem = new ProblemDetails
        {
            Type = $"https://httpstatuses.io/{status}",
            Title = title,
            Status = status,
            Detail = detail,
            Instance = ctx.Request.Path,
        };
        problem.Extensions["traceId"] = correlation.CorrelationId;
        if (extensions is not null) problem.Extensions["errors"] = extensions;

        await ctx.Response.WriteAsync(JsonSerializer.Serialize(problem, JsonOptions));
    }

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
}
