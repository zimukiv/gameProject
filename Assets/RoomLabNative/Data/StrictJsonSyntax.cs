using System;

namespace RoomLab.Native
{
    // RFC 8259 grammar validation only. Newtonsoft remains the sole tree builder.
    // JsonTextReader accepts extensions (single quotes, hex, comments); this scanner
    // rejects them before project input reaches that reader. It does not reconstruct data.
    internal sealed class StrictJsonSyntax
    {
        readonly string text;
        int at;
        StrictJsonSyntax(string text) { this.text=text; }
        internal static void Validate(string text)
        {
            var scanner=new StrictJsonSyntax(text);scanner.Space();scanner.Value(0);scanner.Space();
            if(scanner.at!=text.Length)scanner.Fail();
        }
        void Fail() { throw NativeProjectLoader.Bad("JSON语法无效，位置 "+at); }
        void Space() { while(at<text.Length&&(text[at]==' '||text[at]=='\t'||text[at]=='\n'||text[at]=='\r'))at++; }
        bool Take(char c) { if(at<text.Length&&text[at]==c){at++;return true;}return false; }
        void Need(char c) { if(!Take(c))Fail(); }
        void Value(int depth)
        {
            Space();if(at>=text.Length)Fail();char c=text[at];
            if(c=='{') { Container(depth);Object(depth+1); }
            else if(c=='[') { Container(depth);Array(depth+1); }
            else if(c=='"')String();
            else if(c=='t')Literal("true");
            else if(c=='f')Literal("false");
            else if(c=='n')Literal("null");
            else if(c=='-'||Digit(c))Number();
            else Fail();
        }
        void Container(int depth) { if(depth>=128)throw NativeProjectLoader.Bad("JSON嵌套超过128层"); }
        void Object(int depth)
        {
            Need('{');Space();if(Take('}'))return;
            for(;;) {
                if(at>=text.Length||text[at]!='"')Fail();String();Space();Need(':');Value(depth);Space();
                if(Take('}'))return;Need(',');Space();
            }
        }
        void Array(int depth)
        {
            Need('[');Space();if(Take(']'))return;
            for(;;) { Value(depth);Space();if(Take(']'))return;Need(',');Space(); }
        }
        void String()
        {
            Need('"');while(at<text.Length) {
                char c=text[at++];if(c=='"')return;if(c<0x20)Fail();
                if(c!='\\')continue;if(at>=text.Length)Fail();char escape=text[at++];
                if(escape=='u') { for(int i=0;i<4;i++){if(at>=text.Length||!Hex(text[at]))Fail();at++;} }
                else if(escape!='"'&&escape!='\\'&&escape!='/'&&escape!='b'&&escape!='f'&&escape!='n'&&escape!='r'&&escape!='t')Fail();
            }
            Fail();
        }
        void Number()
        {
            Take('-');if(at>=text.Length)Fail();
            if(!Take('0')) {if(at>=text.Length||text[at]<'1'||text[at]>'9')Fail();while(at<text.Length&&Digit(text[at]))at++;}
            if(Take('.')) {int start=at;while(at<text.Length&&Digit(text[at]))at++;if(start==at)Fail();}
            if(at<text.Length&&(text[at]=='e'||text[at]=='E')) {at++;if(at<text.Length&&(text[at]=='+'||text[at]=='-'))at++;int start=at;while(at<text.Length&&Digit(text[at]))at++;if(start==at)Fail();}
        }
        void Literal(string literal) {if(at>text.Length-literal.Length||string.CompareOrdinal(text,at,literal,0,literal.Length)!=0)Fail();at+=literal.Length;}
        static bool Digit(char c) { return c>='0'&&c<='9'; }
        static bool Hex(char c) { return Digit(c)||c>='a'&&c<='f'||c>='A'&&c<='F'; }
    }
}
