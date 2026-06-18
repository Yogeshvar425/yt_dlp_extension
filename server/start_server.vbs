On Error Resume Next

Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
pythonExe = currentDir & "\venv\Scripts\python.exe"
mainScript = currentDir & "\main.py"
logFile = currentDir & "\server.log"

' Check if the server is already running by trying to connect to port 8000
Set http = CreateObject("MSXML2.XMLHTTP.6.0")
On Error Resume Next
http.Open "GET", "http://127.0.0.1:8000/ping", False
http.Send

If Err.Number = 0 And http.Status = 200 Then
    ' Server is already running, exit silently
    WScript.Quit 0
End If

On Error Resume Next

token = ""
If WScript.Arguments.Count > 0 Then
    token = WScript.Arguments(0)
End If

' Server is NOT running, start it
WshShell.Run "cmd.exe /c cd /d """ & currentDir & """ && """ & pythonExe & """ """ & mainScript & """ --token """ & token & """ > """ & logFile & """ 2>&1", 0, False
